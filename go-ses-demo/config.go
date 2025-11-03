package main

import (
	"fmt"
	"os"
)

type Config struct {
	AWSRegion string
	FromEmail string
	ToEmail   string
}

func LoadConfig() (*Config, error) {
	config := &Config{
		AWSRegion: getEnvWithDefault("AWS_REGION", "us-east-1"),
		FromEmail: os.Getenv("FROM_EMAIL"),
		ToEmail:   os.Getenv("TO_EMAIL"),
	}

	if config.FromEmail == "" {
		return nil, fmt.Errorf("FROM_EMAIL environment variable is required")
	}

	if config.ToEmail == "" {
		return nil, fmt.Errorf("TO_EMAIL environment variable is required")
	}

	return config, nil
}

func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}