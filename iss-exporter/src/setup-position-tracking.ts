import {Gauge, type Registry} from "prom-client";
import {error as logError} from "./logging.js";
import type {Config} from "./config.js";
import {schedule} from "./utilities.js";

/**
 * Setup regular ISS position updates
 *
 * Regularly polls the [Open Notify API](http://open-notify.org) for the current
 * geographic location of the ISS.
 *
 * @param config Application configuration
 * @param registry Prometheus registry to add the location metrics to
 */
export function setupPositionTracking(config: Config, registry: Registry) {
    const positionLatitude = new Gauge({
        name: `${config.metricsPrefix}position_latitude`,
        help: 'ISS current latitude',
        registers: [registry]
    });
    const positionLongitude = new Gauge({
        name: `${config.metricsPrefix}position_longitude`,
        help: 'ISS current longitude',
        registers: [registry]
    });
    const positionAltitude = new Gauge({
        name: `${config.metricsPrefix}altitude`,
        help: 'ISS current altitude',
        registers: [registry]
    });

    const loadPosition = positionLoader(
        config.positionApiUrl,
        positionLatitude,
        positionLongitude,
        positionAltitude,
    );

    schedule(
        loadPosition,
        config.positionUpdateFrequency,
        error => logError(
            `Could not fetch ISS position data: ${error}`,
            {error}
        ),
    );
}

/**
 * Factory function to create a task that polls the Open Notify API
 *
 * This function creates a nested callable with the API URL and metrics
 * instances that can be used to repeatedly update the coordinate metrics.
 *
 * @param url URL to the Open Notify Position API
 * @param latitudeMetric Latitude coordinate metric
 * @param longitudeMetric Longitude coordinate metric
 */
function positionLoader(url: string, latitudeMetric: Gauge, longitudeMetric: Gauge, altitudeMetric: Gauge) {
    return async function loadPosition(signal?: AbortSignal) {
        let response: Response | undefined;
        let data: {
            name: string;
            id: number;
            latitude: number;
            longitude: number;
            altitude: number;
            velocity: number;
            visibility: string;
            footprint: number;
            timestamp: number;
            daynum: number;
            solar_lat: number;
            solar_lon: number;
            units: string;
        } | undefined;

        try {
            response = await fetch(url, {
                signal,
            });
            data = await response.json();
        } catch (error) {
            logError(`Failed to fetch ISS position data`, {
                message: (error as Error).message,
            });

            return;
        }

        if (!response.ok) {
            logError(
                `Failed to fetch ISS position data: ${response.statusText}`,
                {response}
            );

            return;
        }

        if (!data || !data.altitude || !data.latitude || !data.longitude) {
            logError(
                'Failed to parse ISS position data: Unexpected payload',
                {data}
            );

            return;
        }

        const {latitude, longitude, altitude} = data || {};
        latitudeMetric.set(Number(latitude));
        longitudeMetric.set(Number(longitude));
        altitudeMetric.set(Number(altitude));
    }
}
