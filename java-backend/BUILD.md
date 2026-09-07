# Build Java backend

Richiede JDK 21+.

```bash
javac -encoding UTF-8 -d classes src/zerolegend/ZeroLegendServer.java
jar --create --file zerolegend-java.jar -C classes .
```

Il jar incluso è già compilato e verificato in ambiente JDK 21.
