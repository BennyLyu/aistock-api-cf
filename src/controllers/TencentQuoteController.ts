import { TencentQuoteService, TencentIndexQuoteService } from '../services/TencentQuoteService';
import { createResponse } from '../utils/response';
import { Env } from '../index';

/**
 * 腾讯行情控制器
 * 用于替代东方财富行情接口（东方财富 push2 从 Cloudflare Workers 境外 IP 请求会返回 502）
 */
export class TencentQuoteController {

    /** 调试：查看腾讯接口原始返回 /api/tencent/debug?symbols=002594 */
    static async debug(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbolsParam = url.searchParams.get('symbols') || '002594';
        const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

        try {
            const rawText = await TencentQuoteService.getRawResponse(symbols);
            return createResponse(200, 'debug', { raw: rawText, length: rawText.length });
        } catch (err: any) {
            return createResponse(500, err.message);
        }
    }

    /** 股票行情 /api/tencent/stock/quotes?symbols=002594,600036 */
    static async getStockQuotes(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbolsParam = url.searchParams.get('symbols');

        if (!symbolsParam) {
            return createResponse(400, '缺少 symbols 参数，示例: ?symbols=002594,600036');
        }

        const symbols = [...new Set(symbolsParam.split(',').map(s => s.trim()).filter(Boolean))];

        if (symbols.length === 0) {
            return createResponse(400, '缺少 symbols 参数');
        }

        if (symbols.length > 20) {
            return createResponse(400, '单次最多查询 20 只股票');
        }

        try {
            const results = await TencentQuoteService.getBatchQuotes(symbols);
            return createResponse(200, 'success', {
                '来源': '腾讯财经',
                '股票数量': results.length,
                '行情': results,
            });
        } catch (err: any) {
            return createResponse(500, err instanceof Error ? err.message : 'Internal Server Error');
        }
    }

    /** 指数行情 /api/tencent/index/quotes?symbols=000001,399001,399006 */
    static async getIndexQuotes(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbolsParam = url.searchParams.get('symbols');

        if (!symbolsParam) {
            return createResponse(400, '缺少 symbols 参数，示例: ?symbols=000001,399001,399006');
        }

        const symbols = [...new Set(symbolsParam.split(',').map(s => s.trim()).filter(Boolean))];

        if (symbols.length === 0) {
            return createResponse(400, '缺少 symbols 参数');
        }

        if (symbols.length > 20) {
            return createResponse(400, '单次最多查询 20 只指数');
        }

        try {
            const results = await TencentIndexQuoteService.getBatchQuotes(symbols);
            return createResponse(200, 'success', {
                '来源': '腾讯财经',
                '指数数量': results.length,
                '行情': results,
            });
        } catch (err: any) {
            return createResponse(500, err instanceof Error ? err.message : 'Internal Server Error');
        }
    }
}
