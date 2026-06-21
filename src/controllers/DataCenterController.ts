import { createResponse } from '../utils/response';
import { Env } from '../index';

/**
 * 东方财富数据中心服务
 * 注意：push2.eastmoney.com（实时行情）从 CF Workers 不可用，
 * 但 datacenter-web.eastmoney.com（数据中心）和 data.eastmoney.com 通常可用。
 */

/** 新股发行日历 */
export class IpoController {
    static async getIpoList(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            // 东方财富新股日历接口
            const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=APPLY_DATE&sortTypes=-1&pageSize=20&pageNumber=1&reportName=RPTA_APP_IPOAPPLY&columns=ALL&filter=(APPLY_DATE>%272026-01-01%27)';

            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://data.eastmoney.com/',
                },
            });

            if (!resp.ok) {
                throw new Error(`东方财富数据中心请求失败: ${resp.status}`);
            }

            const json: any = await resp.json();

            if (!json.result || !json.result.data) {
                return createResponse(200, 'success', { '新股列表': [] });
            }

            const ipoList = json.result.data.map((item: any) => ({
                '股票名称': item.SECURITY_NAME || '--',
                '申购代码': item.APPLY_CODE || '--',
                '股票代码': item.SECURITY_CODE || '--',
                '发行价': item.ISSUE_PRICE || '--',
                '申购日期': item.APPLY_DATE ? item.APPLY_DATE.split(' ')[0] : '--',
                '上市日期': item.LIST_DATE ? item.LIST_DATE.split(' ')[0] : '--',
                '中签率': item.ONLINE_ISSUE_LWR ? (item.ONLINE_ISSUE_LWR * 100).toFixed(4) + '%' : '--',
                '发行数量(万股)': item.ONLINE_ISSUE_NUM ? (item.ONLINE_ISSUE_NUM / 10000).toFixed(2) : '--',
                '市盈率': item.PE_RATIO || '--',
            }));

            return createResponse(200, 'success', {
                '来源': '东方财富数据中心',
                '总数': ipoList.length,
                '新股列表': ipoList,
            });
        } catch (err: any) {
            return createResponse(500, err instanceof Error ? err.message : 'Internal Server Error');
        }
    }
}

/** 散户集中度 - 股东户数减少 */
export class GdhsController {
    static async getDecrease(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            // 东方财富股东户数接口 - 用 ALL 获取全部字段
            const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=HOLDER_NUM_RATIO&sortTypes=1&pageSize=30&pageNumber=1&reportName=RPT_HOLDERNUM_DET&columns=ALL';

            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Referer': 'https://data.eastmoney.com/gdhs/',
                    'Accept': '*/*',
                },
            });

            if (!resp.ok) {
                throw new Error(`东方财富数据中心请求失败: ${resp.status}`);
            }

            const json: any = await resp.json();

            if (!json.result || !json.result.data || json.result.data.length === 0) {
                // 返回调试信息
                return createResponse(200, 'success', {
                    '股东户数列表': [],
                    'debug_success': json.success,
                    'debug_message': json.message,
                    'debug_code': json.code,
                    'debug_result_keys': json.result ? Object.keys(json.result) : null,
                    'debug_first_item': json.result?.data?.[0] ? Object.keys(json.result.data[0]) : null,
                    'debug_url': url,
                });
            }

            const list = json.result.data.map((item: any) => ({
                '股票名称': item.SECURITY_NAME_ABBR || '--',
                '股票代码': item.SECURITY_CODE || '--',
                '股东户数': item.HOLDER_NUM ? item.HOLDER_NUM.toLocaleString() : '--',
                '较上期变化': item.HOLDER_NUM_CHANGE ? item.HOLDER_NUM_CHANGE.toLocaleString() : '--',
                '变化比例': item.HOLDER_NUM_CHANGE_RATE ? item.HOLDER_NUM_CHANGE_RATE.toFixed(2) + '%' : '--',
                '户均持股数量': item.AVG_HOLD_NUM ? Math.round(item.AVG_HOLD_NUM).toLocaleString() : '--',
                '户均持股市值': item.AVG_MARKET_CAP ? (item.AVG_MARKET_CAP / 10000).toFixed(2) + '万' : '--',
                '总市值(亿)': item.TOTAL_MARKET_CAP ? (item.TOTAL_MARKET_CAP / 100000000).toFixed(2) : '--',
                '公告日期': item.END_DATE ? item.END_DATE.split(' ')[0] : '--',
            }));

            return createResponse(200, 'success', {
                '来源': '东方财富数据中心',
                '总数': list.length,
                '说明': '按股东户数减少比例排序（筹码集中）',
                '股东户数列表': list,
            });
        } catch (err: any) {
            return createResponse(500, err instanceof Error ? err.message : 'Internal Server Error');
        }
    }
}

/** K线数据 - 多源 fallback */
export class TencentKlineController {
    static async getKline(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get('symbol') || '').trim();
        const period = url.searchParams.get('period') || 'day'; // day, week, month
        const count = parseInt(url.searchParams.get('count') || '60');

        if (!symbol) {
            return createResponse(400, '缺少 symbol 参数，示例: ?symbol=002594&period=day&count=60');
        }

        // 确定市场前缀
        let prefix = 'sz';
        if (symbol.startsWith('6') || symbol.startsWith('9')) {
            prefix = 'sh';
        }
        if (symbol.startsWith('5')) prefix = 'sh'; // 上交所ETF

        // 东方财富 secid: 0=深圳, 1=上海
        const secid = prefix === 'sh' ? `1.${symbol}` : `0.${symbol}`;

        // 周期映射 (东方财富: 1=1分钟, 5=5分钟, 15=15分钟, 30=30分钟, 60=60分钟, 101=日, 102=周, 103=月)
        const kltMap: Record<string, number> = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '60min': 60, 'day': 101, 'week': 102, 'month': 103 };
        const klt = kltMap[period] || 101;

        try {
            // 尝试东方财富历史K线接口 (push2his 跟 push2 不同，可能可用)
            const emUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=${klt}&fqt=1&end=20500101&lmt=${count}`;

            const resp = await fetch(emUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://quote.eastmoney.com/',
                },
            });

            if (resp.ok) {
                const json: any = await resp.json();
                if (json.data && json.data.klines && json.data.klines.length > 0) {
                    // 东方财富格式: "2026-06-18,87.00,88.13,89.33,86.08,43579000,3820166910.00,3.72,0.75,0.66,1.25"
                    const kline = json.data.klines.map((line: string) => {
                        const f = line.split(',');
                        return {
                            '日期': f[0],
                            '开盘': parseFloat(f[1]),
                            '收盘': parseFloat(f[2]),
                            '最高': parseFloat(f[3]),
                            '最低': parseFloat(f[4]),
                            '成交量': parseInt(f[5]),
                        };
                    });

                    return createResponse(200, 'success', {
                        '来源': '东方财富',
                        '代码': symbol,
                        '周期': period,
                        '数据条数': kline.length,
                        'K线': kline,
                    });
                }
            }

            // fallback: 新浪财经
            const scaleMap: Record<string, number> = { 'day': 240, 'week': 1200, 'month': 7200 };
            const scale = scaleMap[period] || 240;
            const sinaUrl = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var/CN_MarketDataService.getKLineData?symbol=${prefix}${symbol}&scale=${scale}&ma=no&datalen=${count}`;

            const sinaResp = await fetch(sinaUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://finance.sina.com.cn/',
                },
            });

            if (sinaResp.ok) {
                const text = await sinaResp.text();
                // 新浪返回: var=([{...},{...}])
                const jsonMatch = text.match(/\((\[.+\])\)/);
                if (jsonMatch) {
                    const data = JSON.parse(jsonMatch[1]);
                    const kline = data.map((item: any) => ({
                        '日期': item.day || item.date,
                        '开盘': parseFloat(item.open),
                        '收盘': parseFloat(item.close),
                        '最高': parseFloat(item.high),
                        '最低': parseFloat(item.low),
                        '成交量': parseInt(item.volume || '0'),
                    }));

                    return createResponse(200, 'success', {
                        '来源': '新浪财经',
                        '代码': symbol,
                        '周期': period,
                        '数据条数': kline.length,
                        'K线': kline,
                    });
                }
            }

            return createResponse(404, 'K线数据源均不可用', {
                debug_em_status: resp.status,
                debug_sina_status: sinaResp.status,
            });

        } catch (err: any) {
            return createResponse(500, err instanceof Error ? err.message : 'Internal Server Error');
        }
    }
}
