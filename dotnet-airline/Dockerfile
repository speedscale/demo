FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/BookingApi/BookingApi.csproj src/BookingApi/
COPY src/PartnerSim/PartnerSim.csproj src/PartnerSim/
RUN dotnet restore src/BookingApi/BookingApi.csproj && dotnet restore src/PartnerSim/PartnerSim.csproj
COPY src/ src/
RUN dotnet publish src/BookingApi/BookingApi.csproj -c Release --no-restore -o /out/api /p:UseAppHost=false     && dotnet publish src/PartnerSim/PartnerSim.csproj -c Release --no-restore -o /out/partners /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV LISTEN_HOST=0.0.0.0 DOTNET_EnableDiagnostics=0
USER $APP_UID

FROM runtime AS booking-api
COPY --from=build /out/api/ .
EXPOSE 8090
ENTRYPOINT ["dotnet", "BookingApi.dll"]

FROM runtime AS partners
COPY --from=build /out/partners/ .
EXPOSE 5051 5052 5053
ENTRYPOINT ["dotnet", "PartnerSim.dll"]
