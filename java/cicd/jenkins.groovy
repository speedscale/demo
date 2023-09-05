// Uses Declarative syntax to run commands inside a container.
pipeline {
    agent {
        kubernetes {
            inheritFrom 'default'
        }
    }
    
    environment {
        PATH = "${env.PATH}:${HOME}/.speedscale"
        SNAPSHOT_ID = "latest"
        TEST_CONFIG_ID = "regression-debug-java-server-certs"
        CLUSTER_NAME = "miniken"
        SERVICE = "java-server"
    }

    stages {
        stage('Setup') {
            steps {
                script {
                    echo 'setup'
                }
            }
        }

        stage('Clone') {
            steps {
                script {
                    try {
                        checkout scm: [
                            $class: 'GitSCM',
                            branches: [
                                [
                                    name: '*/master'
                                ]
                            ],
                            extensions: [],
                            userRemoteConfigs: [
                                [
                                    url: 'https://github.com/speedscale/demo.git'
                                ]
                            ]
                        ]
                        
                        echo 'Clone succeeded'
                    } catch (Exception e) {
                        echo 'Clone failed ' + e.toString()
                        error 'Clone failed ' + e.toString()
                    }
                }
            }
        }

        stage('Prepare') {
            steps {
                script {
                    try {
                        sh 'sh -c "$(curl -Lfs https://downloads.speedscale.com/speedctl/install)"'
                        sh 'speedctl check'
                    } catch (Exception e) {
                        error 'Prepare failed ' + e.toString()
                    }
                }
            }
        }

        stage('Validate') {
            steps {
                script {
                    try {
                        sh '''
                            REPORT_ID=$(speedctl infra replay \
                                --test-config-id $TEST_CONFIG_ID \
                                --snapshot-id $SNAPSHOT_ID \
                                --build-tag $BUILD_NUMBER \
                                --cluster $CLUSTER_NAME $SERVICE)
                            echo "waiting for replay with report ID $REPORT_ID to complete"
                            speedctl wait report "$REPORT_ID" --timeout 5m
                            '''
                    } catch (Exception e) {
                        error 'Validate failed ' + e.toString()
                    }
                }
            }
        }
    }
}
