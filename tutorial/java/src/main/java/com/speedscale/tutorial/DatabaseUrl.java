package com.speedscale.tutorial;

import java.net.URI;

/** Converts the contract's postgres:// URL into the pieces the JDBC driver wants. */
public record DatabaseUrl(String jdbcUrl, String username, String password) {

    public static DatabaseUrl parse(String url) {
        URI uri = URI.create(url);
        String scheme = uri.getScheme();
        if (!"postgres".equals(scheme) && !"postgresql".equals(scheme)) {
            throw new IllegalArgumentException("DATABASE_URL must start with postgres://");
        }
        String username = "";
        String password = "";
        String userInfo = uri.getUserInfo();
        if (userInfo != null) {
            int colon = userInfo.indexOf(':');
            username = colon < 0 ? userInfo : userInfo.substring(0, colon);
            password = colon < 0 ? "" : userInfo.substring(colon + 1);
        }
        int port = uri.getPort() < 0 ? 5432 : uri.getPort();
        String path = uri.getPath() == null ? "" : uri.getPath();
        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://")
                .append(uri.getHost()).append(':').append(port).append(path);
        String query = uri.getRawQuery();
        jdbc.append('?');
        if (query != null && !query.isEmpty()) {
            jdbc.append(query).append('&');
        }
        // No named server-side prepared statements: every port puts unnamed statements on the wire.
        jdbc.append("prepareThreshold=0");
        return new DatabaseUrl(jdbc.toString(), username, password);
    }
}
