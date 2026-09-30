package com.speedscale.tutorial;

import java.util.List;
import java.util.Optional;

/** The hosted CNCF projects API. Any failure other than "unknown project" is a 502 ApiException. */
public interface ProjectsClient {

    /** GET /v1/projects, in upstream order. */
    List<Project> listProjects();

    /** GET /v1/project/{id}; empty when upstream says 404. */
    Optional<Project> getProject(String id);
}
