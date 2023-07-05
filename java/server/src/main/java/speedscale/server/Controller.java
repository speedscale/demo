package speedscale.server;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Controller {

    static final Logger log = LogManager.getLogger();

    @GetMapping("/healthz")
    public String health() {
        return "{\"health\": \"ok\"}";
    }

    @GetMapping("/launches")
    public String launches() {
        try {
            return SpaceX.invoke();
        } catch (Exception e) {
            log.catching(e);
        }
        return "{}";
    }

}
