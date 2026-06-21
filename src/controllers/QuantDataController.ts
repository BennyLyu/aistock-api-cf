import { createResponse } from '../utils/response';
import { Env } from '../index';

/**
 * 量化数据控制器
 * - 主力资金流向
 * - 北向资金
 * - 龙虎榜
 * - 大宗交易
 */

/** 个股主力资金流向 */
export class MoneyFlowController {
    /** /api/cn/stock/moneyflow?symbol=002594 */
    static async getMoneyFlow(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get('symbol') || '').trim();
        if (!symbol || symbol.length !== 6) return createResponse(400, '缺少 symbol 参数');

        try {
            const prefix = symbol.startsWith('6') || symbol.startsWith('9') ? '1' : '0';
            const secid = `${prefix}.${symbol}`;
            const apiUrl = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&lmt=10`;

            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' },
            });
            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();
            const klines = json.data?.klines || [];

            // 格式: 日期,主力净流入,小单净流入,中单净流入,大单净流入,超大单净流入
            const list = klines.map((line: string) => {
                const f = line.split(',');
                return {
                    '日期': f[0],
                    '主力净流入': (parseFloat(f[1]) / 1e4).toFixed(2) + '万',
                    '小单净流入': (parseFloat(f[2]) / 1e4).toFixed(2) + '万',
                    '中单净流入': (parseFloat(f[3]) / 1e4).toFixed(2) + '万',
                    '大单净流入': (parseFloat(f[4]) / 1e4).toFixed(2) + '万',
                    '超大单净流入': (parseFloat(f[5]) / 1e4).toFixed(2) + '万',
                    '主力净流入额': parseFloat(f[1]),
                };
            });

            return createResponse(200, 'success', { '来源': '东方财富', '代码': symbol, '资金流向': list });
        } catch (err: any) { return createResponse(500, err.message); }
    }

    /** /api/cn/market/moneyflow - 大盘资金流向 */
    static async getMarketFlow(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            const apiUrl = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=1.000001&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&lmt=10';
            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' },
            });
            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();
            const klines = json.data?.klines || [];

            const list = klines.map((line: string) => {
                const f = line.split(',');
                return {
                    '日期': f[0],
                    '主力净流入(亿)': (parseFloat(f[1]) / 1e8).toFixed(2),
                    '主力净流入额': parseFloat(f[1]),
                };
            });
            return createResponse(200, 'success', { '来源': '东方财富', '大盘资金': list });
        } catch (err: any) { return createResponse(500, err.message); }
    }
}

/** 北向资金 */
export class NorthboundController {
    /** /api/cn/northbound */
    static async getNorthbound(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            const apiUrl = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_DEAL_HISTORY&columns=ALL&sortColumns=TRADE_DATE&sortTypes=-1&pageSize=20&pageNumber=1';
            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/' },
            });
            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();
            const items = json.result?.data || [];

            const list = items.map((item: any) => ({
                '日期': item.TRADE_DATE ? item.TRADE_DATE.split(' ')[0] : '--',
                '沪股通净买入(亿)': item.MUTUAL_A_NET != null ? (item.MUTUAL_A_NET / 1e8).toFixed(2) : '--',
                '深股通净买入(亿)': item.MUTUAL_D_NET != null ? (item.MUTUAL_D_NET / 1e8).toFixed(2) : '--',
                '北向合计(亿)': item.NET_DEAL_AMT != null ? (item.NET_DEAL_AMT / 1e8).toFixed(2) : '--',
                '北向合计额': item.NET_DEAL_AMT || 0,
            }));

            return createResponse(200, 'success', { '来源': '东方财富', '北向资金': list });
        } catch (err: any) { return createResponse(500, err.message); }
    }
}

/** 龙虎榜 */
export class DragonTigerController {
    /** /api/cn/dragontiger */
    static async getDragonTiger(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            // 获取最近龙虎榜数据
            const today = new Date().toISOString().split('T')[0];
            const apiUrl = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&sortColumns=SECURITY_CODE&sortTypes=1&pageSize=30&pageNumber=1&filter=(TRADE_DATE>='${today.slice(0, 7)}-01')`;
            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/' },
            });
            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();
            const items = json.result?.data || [];

            const list = items.map((item: any) => ({
                '股票名称': item.SECURITY_NAME_ABBR || '--',
                '股票代码': item.SECURITY_CODE || '--',
                '上榜日期': item.TRADE_DATE ? item.TRADE_DATE.split(' ')[0] : '--',
                '收盘价': item.CLOSE_PRICE != null ? item.CLOSE_PRICE.toFixed(2) : '--',
                '涨跌幅': item.CHANGE_RATE != null ? item.CHANGE_RATE.toFixed(2) + '%' : '--',
                '上榜原因': item.EXPLAIN || '--',
                '买入额(万)': item.BUY_AMT != null ? (item.BUY_AMT / 1e4).toFixed(2) : '--',
                '卖出额(万)': item.SELL_AMT != null ? (item.SELL_AMT / 1e4).toFixed(2) : '--',
                '净额(万)': item.NET_AMT != null ? (item.NET_AMT / 1e4).toFixed(2) : '--',
            }));

            return createResponse(200, 'success', { '来源': '东方财富', '龙虎榜': list, debug_msg: json.message });
        } catch (err: any) { return createResponse(500, err.message); }
    }
}

/** 大宗交易 */
export class BlockTradeController {
    /** /api/cn/blocktrade */
    static async getBlockTrades(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            const apiUrl = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BLOCKTRADE_DETAILSNEW&columns=ALL&sortColumns=TRADE_DATE&sortTypes=-1&pageSize=30&pageNumber=1';
            const resp = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/' },
            });
            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();
            const items = json.result?.data || [];

            const list = items.map((item: any) => ({
                '股票名称': item.SECURITY_NAME_ABBR || '--',
                '股票代码': item.SECURITY_CODE || '--',
                '成交日期': item.TRADE_DATE ? item.TRADE_DATE.split(' ')[0] : '--',
                '成交价': item.DEAL_PRICE != null ? item.DEAL_PRICE.toFixed(2) : '--',
                '成交量(万股)': item.DEAL_VOL != null ? (item.DEAL_VOL / 1e4).toFixed(2) : '--',
                '成交额(万)': item.DEAL_AMT != null ? (item.DEAL_AMT / 1e4).toFixed(2) : '--',
                '溢价率': item.PREMIUM_RATIO != null ? item.PREMIUM_RATIO.toFixed(2) + '%' : '--',
                '买方': item.BUYER_NAME || '--',
                '卖方': item.SELLER_NAME || '--',
            }));

            return createResponse(200, 'success', { '来源': '东方财富', '大宗交易': list, debug_msg: json.message });
        } catch (err: any) { return createResponse(500, err.message); }
    }
}
