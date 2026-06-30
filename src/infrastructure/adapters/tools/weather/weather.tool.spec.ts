import { z } from 'zod';
import { WeatherTool } from './weather.tool';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from '../../../../config/config.schema';

const mockAxiosInstance = {
  get: jest.fn(),
};

jest.mock('axios', () => {
  return {
    create: jest.fn(() => mockAxiosInstance),
    get: jest.fn(),
  };
});

const axiosGetMock = mockAxiosInstance.get;

describe('WeatherTool', () => {
  let tool: WeatherTool;
  let mockConfigService: jest.Mocked<ConfigService<AppConfig>>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService<AppConfig>>;

    tool = new WeatherTool(mockConfigService);
    jest.clearAllMocks();
  });

  it('should be defined with correct properties', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('weather');
    expect(tool.description).toContain('Get the daily weather forecast');
  });

  it('should throw an error if API key is not configured', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    await expect(
      tool.execute({ latitude: 12.34, longitude: 56.78 }),
    ).rejects.toThrow('Weather API key is not configured.');
  });

  it('should call Google weather API and return formatted daily forecast', async () => {
    mockConfigService.get.mockReturnValue('test-api-key');

    const mockResponse = {
      data: {
        timeZone: { id: 'Europe/Rome' },
        forecastDays: [
          {
            interval: {
              startTime: '2026-06-20T07:00:00Z',
              endTime: '2026-06-21T07:00:00Z',
            },
            minTemperature: { degrees: 15, unit: 'CELSIUS' },
            maxTemperature: { degrees: 28, unit: 'CELSIUS' },
            dayTimeForecast: {
              weatherCondition: {
                description: { text: 'Sunny' },
              },
            },
            nightTimeForecast: {
              weatherCondition: {
                description: { text: 'Clear' },
              },
            },
          },
        ],
      },
    };

    axiosGetMock.mockResolvedValue(mockResponse);

    const result = await tool.execute({
      latitude: 41.9028,
      longitude: 12.4964,
      days: 1,
    });

    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://weather.googleapis.com/v1/forecast/days:lookup',
      {
        params: {
          key: 'test-api-key',
          'location.latitude': 41.9028,
          'location.longitude': 12.4964,
          days: 1,
        },
      },
    );

    expect(result).toEqual({
      timeZone: 'Europe/Rome',
      forecasts: [
        {
          date: '2026-06-20',
          minTemp: 15,
          maxTemp: 28,
          unit: 'CELSIUS',
          daytimeCondition: 'Sunny',
          nighttimeCondition: 'Clear',
        },
      ],
    });
  });

  it('should default to 5 days if days is not specified', async () => {
    mockConfigService.get.mockReturnValue('test-api-key');
    axiosGetMock.mockResolvedValue({ data: {} });

    await tool.execute({
      latitude: 41.9028,
      longitude: 12.4964,
    });

    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://weather.googleapis.com/v1/forecast/days:lookup',
      {
        params: {
          key: 'test-api-key',
          'location.latitude': 41.9028,
          'location.longitude': 12.4964,
          days: 5,
        },
      },
    );
  });

  it('should use default Brandenburg Gate location if latitude and longitude are parsed from empty input', async () => {
    mockConfigService.get.mockReturnValue('test-api-key');
    axiosGetMock.mockResolvedValue({ data: {} });

    const parsedInput = tool.schema.parse({});
    await tool.execute(parsedInput);

    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://weather.googleapis.com/v1/forecast/days:lookup',
      {
        params: {
          key: 'test-api-key',
          'location.latitude': 52.52091519494772,
          'location.longitude': 13.376471080450543,
          days: 5,
        },
      },
    );
  });

  it('should propagate error on 400 bad request without retrying', async () => {
    mockConfigService.get.mockReturnValue('test-api-key');
    const mockError = {
      response: {
        status: 400,
      },
      message: 'Request failed with status code 400',
    };
    axiosGetMock.mockRejectedValue(mockError);

    await expect(
      tool.execute({ latitude: 12.34, longitude: 56.78 }),
    ).rejects.toThrow();
  });
});

describe('tool contract stability', () => {
  it('definition snapshot', () => {
    const mockConfig = { get: jest.fn().mockReturnValue('test-api-key') } as any;
    const tool = new WeatherTool(mockConfig);
    expect({
      name: tool.name,
      version: tool.version,
      description: tool.description,
      schema: z.toJSONSchema(tool.schema),
    }).toMatchSnapshot();
  });
});
