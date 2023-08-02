package speedscale.model;

import java.util.Random;

public class Login {
    String username, password;
    private static final Random r = new Random();

    public String getUsername() {
        return username;
    }

    public String getPassword() {
        try {
            Thread.sleep(r.nextLong(50));
        } catch (InterruptedException e) {
            // ignored
        }
        return password;
    }
}
