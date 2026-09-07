FROM eclipse-temurin:21-jre
WORKDIR /app
COPY zerolegend-java.jar /app/zerolegend-java.jar
EXPOSE 3000
ENV PORT=3000
ENV AUTH_REQUIRED=1
ENV AUTH_VERIFY_URL=https://zerothelegend.gamer.gd/auth/auth.php
ENV ECONOMY_API_URL=https://zerothelegend.gamer.gd/auth/economy.php
ENV MAX_PLAYERS=160
ENV INITIAL_BOTS=8
ENTRYPOINT ["java","-jar","/app/zerolegend-java.jar"]
