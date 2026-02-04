<?php
require __DIR__ . '/vendor/autoload.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

$app = AppFactory::create();

// Health endpoint
$app->get('/health', function (Request $request, Response $response) {
    $response->getBody()->write(json_encode(['status' => 'ok']));
    return $response->withHeader('Content-Type', 'application/json');
});

// SpaceX proxy endpoint
$app->get('/spacex/launches', function (Request $request, Response $response) {
    $client = new \GuzzleHttp\Client();
    try {
        $apiResponse = $client->get('https://api.spacexdata.com/v4/launches/latest');
        $response->getBody()->write((string) $apiResponse->getBody());
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

$app->run();
