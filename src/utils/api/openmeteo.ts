import axios from 'axios';

export type PointWeather = {
  latitude: number;
  longitude: number;
  timezone?: string;
  hourly?: any;
  daily?: any;
};

export async function fetchPointWeather(lat: number, lon: number, days = 3): Promise<PointWeather> {
  const params: any = {
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
    hourly: 'temperature_2m,precipitation,windspeed_10m,winddirection_10m',
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum',
    forecast_days: days,
  };
  const url = 'https://api.open-meteo.com/v1/forecast';
  const res = await axios.get(url, { params, timeout: 8000 });
  return { latitude: lat, longitude: lon, timezone: res.data.timezone, hourly: res.data.hourly, daily: res.data.daily };
}
