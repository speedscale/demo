#!/bin/bash
cd /Users/matthewleray/s2/speedscale/speedctl
PROGRAM_NAME=proxymock make install
cd /Users/matthewleray/s2/demo/go-drift-demo
proxymock web