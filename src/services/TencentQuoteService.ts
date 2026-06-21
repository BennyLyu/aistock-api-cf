import { getStockIdentity } from '../utils/stock';

/**
 * 腾讯财经实时行情服务
 * 替代东方财富 push2（被 Cloudflare Workers 境外 IP 拦截）
 *
 * 接口: https://qt.gtimg.cn/q=sz002594,sh600036
 *
 * 返回格式（~分隔）:
 * 0: 未知
 * 1: 股票名称
 * 2: 股票代码
 * 3: 最新价
 * 4: 昨收价
 * 5: 今开价
 * 6: 成交量（手）
 * 7: 外盘（手）
 * 8: 内盘（手）
 * 9-28: 买卖五档
 * 29: 最近逐笔成交时间
 * 30: 涨跌额
 * 31: 涨跌幅(%)
 * 32: 最高价
 * 33: 最低价
 * 34: 价格/成交量/成交额
 * 35: 成交量（手）
 * 36: 成交额（万元）
 * 37: 换手率(%)
 * 38: 市盈率
 * 39: 未知
 * 40: 最高价
 * 41: 最低价
 * 42: 振幅(%)
 * 43: 流通市值（亿）
 * 44: 总市值（亿）
 * 45: 市净率
 * 46: 涨停价
 * 47: 跌停价
 */
export class TencentQuoteService {
    private static readonly BASE_URL = 'https://qt.gtimg.cn/q=';

    /**
     * 根据代码获取腾讯接口使用的 market prefix
     */
    private static getMarketPrefix(symbol: string): string {
        const identity = getStockIdentity(symbol);
        if (identity.market === 'sh') return 'sh';
        if (identity.market === 'sz') return 'sz';
        if (identity.market === 'bj') return 'bj';

        // ETF 代码处理
        // 5开头: 上交所ETF, 1开头: 深交所ETF
        if (symbol.startsWith('5')) return 'sh';
        if (symbol.startsWith('1')) return 'sz';

        // 默认尝试用深交所
        return 'sz';
    }

    /**
     * 解析腾讯行情接口返回的单条数据
     */
    private static parseSingleQuote(line: string): Record<string, any> | null {
        // 格式: v_sz002594="51~比亚迪~002594~88.13~...";
        const match = line.match(/v_\w+="(.+)"/);
        if (!match || !match[1]) return null;

        const fields = match[1].split('~');
        if (fields.length < 35) return null;

        const price = parseFloat(fields[3]);
        const prevClose = parseFloat(fields[4]);
        const changeAmt = parseFloat(fields[31]);
        const changePct = parseFloat(fields[32]);
        const volume = parseInt(fields[6]) * 100; // 手转股
        const amount = parseFloat(fields[37]) * 10000; // 万转元
        const turnoverRate = parseFloat(fields[38]) || 0;

        return {
            '股票代码': fields[2],
            '股票简称': fields[1],
            '最新价': price,
            '涨跌幅': changePct,
            '涨跌额': changeAmt,
            '昨收价': prevClose,
            '今开价': parseFloat(fields[5]),
            '最高价': parseFloat(fields[33]),
            '最低价': parseFloat(fields[34]),
            '成交量': volume,
            '成交额': amount,
            '换手率': turnoverRate,
            '更新时间': fields[30] || '--',
        };
    }

    /**
     * 获取原始响应文本（用于调试）
     */
    static async getRawResponse(symbols: string[]): Promise<string> {
        const querySymbols = symbols.map(s => `${this.getMarketPrefix(s)}${s}`).join(',');
        const url = `${this.BASE_URL}${querySymbols}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.qq.com/',
            },
        });

        if (!response.ok) {
            throw new Error(`腾讯行情接口请求失败: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        // 尝试 GBK 解码
        try {
            return new TextDecoder('gbk').decode(buffer);
        } catch {
            return new TextDecoder('utf-8').decode(buffer);
        }
    }

    /**
     * 批量获取股票实时行情
     */
    static async getBatchQuotes(symbols: string[]): Promise<Record<string, any>[]> {
        const querySymbols = symbols.map(s => `${this.getMarketPrefix(s)}${s}`).join(',');
        const url = `${this.BASE_URL}${querySymbols}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.qq.com/',
            },
        });

        if (!response.ok) {
            throw new Error(`腾讯行情接口请求失败: ${response.status}`);
        }

        // 腾讯返回 GBK 编码的文本
        const buffer = await response.arrayBuffer();
        const text = new TextDecoder('gbk').decode(buffer);

        const lines = text.split('\n').filter(line => line.trim());
        const results: Record<string, any>[] = [];

        for (let i = 0; i < symbols.length; i++) {
            const line = lines[i];
            if (!line) {
                results.push({ '股票代码': symbols[i], '错误': '无数据' });
                continue;
            }

            const parsed = this.parseSingleQuote(line);
            if (parsed) {
                results.push(parsed);
            } else {
                results.push({ '股票代码': symbols[i], '错误': '解析失败' });
            }
        }

        return results;
    }

    /**
     * 获取单只股票行情
     */
    static async getQuote(symbol: string): Promise<Record<string, any>> {
        const results = await this.getBatchQuotes([symbol]);
        return results[0];
    }
}

/**
 * 腾讯指数行情服务
 *
 * 指数代码:
 * - 上证指数: sh000001
 * - 深证成指: sz399001
 * - 创业板指: sz399006
 */
export class TencentIndexQuoteService {
    private static readonly BASE_URL = 'https://qt.gtimg.cn/q=';

    private static getIndexPrefix(symbol: string): string {
        // 上证指数以 000 开头
        if (symbol.startsWith('000')) return 'sh';
        // 深证指数以 399 开头
        if (symbol.startsWith('399')) return 'sz';
        return 'sh';
    }

    private static parseSingleIndex(line: string): Record<string, any> | null {
        const match = line.match(/v_\w+="(.+)"/);
        if (!match || !match[1]) return null;

        const fields = match[1].split('~');
        if (fields.length < 35) return null;

        return {
            '指数代码': fields[2],
            '指数名称': fields[1],
            '最新价': parseFloat(fields[3]),
            '涨跌幅': parseFloat(fields[32]),
            '涨跌额': parseFloat(fields[31]),
            '昨收价': parseFloat(fields[4]),
            '今开价': parseFloat(fields[5]),
            '最高价': parseFloat(fields[33]),
            '最低价': parseFloat(fields[34]),
            '成交量': parseInt(fields[6]) * 100,
            '成交额': parseFloat(fields[37]) * 10000,
        };
    }

    static async getBatchQuotes(symbols: string[]): Promise<Record<string, any>[]> {
        const querySymbols = symbols.map(s => `${this.getIndexPrefix(s)}${s}`).join(',');
        const url = `${this.BASE_URL}${querySymbols}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.qq.com/',
            },
        });

        if (!response.ok) {
            throw new Error(`腾讯指数接口请求失败: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const text = new TextDecoder('gbk').decode(buffer);

        const lines = text.split('\n').filter(line => line.trim());
        const results: Record<string, any>[] = [];

        for (let i = 0; i < symbols.length; i++) {
            const line = lines[i];
            if (!line) {
                results.push({ '指数代码': symbols[i], '错误': '无数据' });
                continue;
            }
            const parsed = this.parseSingleIndex(line);
            if (parsed) {
                results.push(parsed);
            } else {
                results.push({ '指数代码': symbols[i], '错误': '解析失败' });
            }
        }

        return results;
    }
}
