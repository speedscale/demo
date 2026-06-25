package com.speedscale.repro;

import io.micronaut.runtime.Micronaut;

public class OtelGrpcReproApplication {
    public static void main(String[] args) {
        Micronaut.run(OtelGrpcReproApplication.class, args);
    }
}
