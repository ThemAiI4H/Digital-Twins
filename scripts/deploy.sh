#!/bin/bash

# Digital Twin Backend - Deployment Script
# This script deploys the scalable digital twin backend using Docker Swarm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
STACK_NAME="digital-twin"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi

    log_success "Dependencies check passed"
}

check_swarm_mode() {
    log_info "Checking Docker Swarm mode..."

    if ! docker info | grep -q "Swarm: active"; then
        log_warning "Docker Swarm is not active. Initializing..."
        docker swarm init
        log_success "Docker Swarm initialized"
    else
        log_success "Docker Swarm is active"
    fi
}

build_images() {
    log_info "Building Docker images..."
    docker-compose -f $COMPOSE_FILE build --parallel
    log_success "Images built successfully"
}

deploy_stack() {
    log_info "Deploying stack: $STACK_NAME"

    # Remove existing stack if it exists
    if docker stack ls | grep -q $STACK_NAME; then
        log_warning "Stack $STACK_NAME already exists. Removing..."
        docker stack rm $STACK_NAME
        sleep 10
    fi

    # Deploy new stack
    docker stack deploy -c $COMPOSE_FILE $STACK_NAME
    log_success "Stack deployed successfully"
}

wait_for_services() {
    log_info "Waiting for services to be ready..."

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL..."
    sleep 30

    # Wait for Redis
    log_info "Waiting for Redis..."
    sleep 10

    # Wait for backend services
    log_info "Waiting for backend services..."
    sleep 20

    log_success "Services should be ready"
}

check_deployment() {
    log_info "Checking deployment status..."

    # Check stack services
    docker stack services $STACK_NAME

    # Check service health
    log_info "Service status:"
    docker service ls | grep $STACK_NAME

    # Check running containers
    log_info "Running tasks:"
    docker stack ps $STACK_NAME

    log_success "Deployment check completed"
}

show_endpoints() {
    log_info "Deployment endpoints:"
    echo "WebSocket: ws://localhost/ws"
    echo "Health Check: http://localhost/health"
    echo "Metrics: http://localhost/metrics"
    echo "Grafana: http://localhost:3001 (admin/admin)"
    echo "Prometheus: http://localhost:9090"
}

scale_services() {
    local service_name=$1
    local replicas=$2

    log_info "Scaling $service_name to $replicas replicas..."
    docker service scale ${STACK_NAME}_${service_name}=${replicas}
    log_success "Service scaled successfully"
}

# Main deployment function
main() {
    echo "🚀 Digital Twin Backend Scalable Deployment"
    echo "=========================================="

    check_dependencies
    check_swarm_mode
    build_images
    deploy_stack
    wait_for_services
    check_deployment
    show_endpoints

    log_success "Deployment completed successfully!"
    echo ""
    echo "Useful commands:"
    echo "  View logs: docker service logs ${STACK_NAME}_digital-twin-backend"
    echo "  Scale backend: $0 scale backend 5"
    echo "  Remove stack: docker stack rm $STACK_NAME"
}

# Scale command
scale() {
    if [ $# -ne 2 ]; then
        log_error "Usage: $0 scale <service> <replicas>"
        echo "Services: backend, nginx, redis, postgres"
        exit 1
    fi

    service=$1
    replicas=$2

    case $service in
        backend)
            scale_services "digital-twin-backend" $replicas
            ;;
        nginx)
            scale_services "nginx" $replicas
            ;;
        redis)
            scale_services "redis" $replicas
            ;;
        postgres)
            scale_services "postgres" $replicas
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Available services: backend, nginx, redis, postgres"
            exit 1
            ;;
    esac
}

# Command line interface
case "${1:-deploy}" in
    deploy)
        main
        ;;
    scale)
        shift
        scale "$@"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Usage: $0 [deploy|scale <service> <replicas>]"
        exit 1
        ;;
esac
