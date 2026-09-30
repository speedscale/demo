package com.speedscale.tutorial;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

@SpringBootApplication
public class TutorialApplication {

    public static void main(String[] args) {
        SpringApplication.run(TutorialApplication.class, args);
    }

    @EventListener(ApplicationReadyEvent.class)
    void announce(ApplicationReadyEvent event) {
        Environment env = event.getApplicationContext().getEnvironment();
        AppSettings settings = event.getApplicationContext().getBean(AppSettings.class);
        System.out.println(startupLine(env.getProperty("PORT", "8080"), settings));
    }

    static String startupLine(String port, AppSettings settings) {
        return "tutorial-orders (java) listening on :" + port
                + " version=" + settings.version() + " slow=" + settings.slow();
    }
}
