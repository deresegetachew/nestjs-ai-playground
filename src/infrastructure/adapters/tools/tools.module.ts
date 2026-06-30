import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CalculatorTool } from './calculator/calculator.tool';
import { WeatherTool } from './weather/weather.tool';
import { AGENT_TOOLS } from '../../../application/ports/tool.tokens';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    CalculatorTool,
    WeatherTool,
    {
      provide: AGENT_TOOLS,
      useFactory: (calc: CalculatorTool, weather: WeatherTool) => [
        calc,
        weather,
      ],
      inject: [CalculatorTool, WeatherTool],
    },
  ],
  exports: [CalculatorTool, WeatherTool, AGENT_TOOLS],
})
export class ToolsModule {}
