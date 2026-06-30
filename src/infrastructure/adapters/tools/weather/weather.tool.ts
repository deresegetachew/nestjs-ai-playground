import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';
import { AppConfig } from '../../../../config/config.schema';
import { BaseHttpTool } from '../base-http.tool';

const WeatherInputSchema = z.object({
  latitude: z
    .number()
    .default(52.52091519494772)
    .describe(
      'Latitude of the location, e.g. 52.520915. Defaults to Berlin Brandenburg Gate.',
    ),
  longitude: z
    .number()
    .default(13.376471080450543)
    .describe(
      'Longitude of the location, e.g. 13.376471. Defaults to Berlin Brandenburg Gate.',
    ),
  days: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Number of days to forecast, up to 10. Defaults to 5.'),
});

type WeatherInput = z.infer<typeof WeatherInputSchema>;

export interface WeatherForecast {
  date: string;
  minTemp: number;
  maxTemp: number;
  unit: string;
  daytimeCondition?: string;
  nighttimeCondition?: string;
}

export interface WeatherOutput {
  timeZone?: string;
  forecasts: WeatherForecast[];
}

interface GoogleWeatherCondition {
  description?: {
    text?: string;
  };
}

interface ForecastDayPart {
  weatherCondition?: GoogleWeatherCondition;
}

interface Temperature {
  degrees?: number;
  unit?: string;
}

interface ForecastDay {
  interval?: {
    startTime?: string;
    endTime?: string;
  };
  minTemperature?: Temperature;
  maxTemperature?: Temperature;
  dayTimeForecast?: ForecastDayPart;
  nightTimeForecast?: ForecastDayPart;
}

interface GoogleWeatherResponse {
  timeZone?: {
    id?: string;
  };
  forecastDays?: ForecastDay[];
}

@Injectable()
export class WeatherTool extends BaseHttpTool implements Tool<WeatherInput, WeatherOutput> {
  readonly name = 'weather';
  readonly description =
    'Get the daily weather forecast for a location (latitude, longitude) for a specified number of days. ' +
    'Returns forecast summaries with temperatures and weather conditions.';
  readonly version = '1';
  readonly schema = WeatherInputSchema;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    super();
  }

  async execute(input: WeatherInput): Promise<WeatherOutput> {
    const apiKey = this.configService.get('weatherAPIKey', { infer: true });
    if (!apiKey) {
      throw new Error('Weather API key is not configured.');
    }

    const days = input.days ?? 5;
    const url = 'https://weather.googleapis.com/v1/forecast/days:lookup';

    const response = await this.requestWithRetry(() =>
      this.httpClient.get<GoogleWeatherResponse>(url, {
        params: {
          key: apiKey,
          'location.latitude': input.latitude,
          'location.longitude': input.longitude,
          days: days,
        },
      }),
    );

    const data = response.data;
    const forecasts: WeatherForecast[] = [];

    if (data.forecastDays && Array.isArray(data.forecastDays)) {
      for (const day of data.forecastDays) {
        const date = day.interval?.startTime
          ? day.interval.startTime.substring(0, 10)
          : '';
        const minTemp = day.minTemperature?.degrees ?? 0;
        const maxTemp = day.maxTemperature?.degrees ?? 0;
        const unit = day.minTemperature?.unit ?? 'CELSIUS';
        const daytimeCondition =
          day.dayTimeForecast?.weatherCondition?.description?.text;
        const nighttimeCondition =
          day.nightTimeForecast?.weatherCondition?.description?.text;

        forecasts.push({
          date,
          minTemp,
          maxTemp,
          unit,
          daytimeCondition,
          nighttimeCondition,
        });
      }
    }

    return {
      timeZone: data.timeZone?.id,
      forecasts,
    };
  }
}
