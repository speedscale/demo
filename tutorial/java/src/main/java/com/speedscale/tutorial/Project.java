package com.speedscale.tutorial;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** A project from the CNCF projects API. Other upstream fields are ignored. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Project(String id, String name, String maturity) {
}
