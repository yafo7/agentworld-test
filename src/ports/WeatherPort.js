export class WeatherPort {
  async getCurrentWeather(_request) {
    throw new Error('getCurrentWeather() is not implemented');
  }
}

export function assertWeatherPort(port) {
  if (!port || typeof port.getCurrentWeather !== 'function') {
    throw new TypeError('WeatherPort.getCurrentWeather() is required');
  }
  return port;
}
