## Demo

This is the world's simplest demo application for k8s. It's nothing more than a series of nginx endpoints configured to run in Kubernetes and pretend to be an online ordering application.

## Usage

`kubectl apply -k ./` to deploy 3 services: gateway, payment and user.
`kubectl apply -f job.yaml` to generate traffic against gateway.
