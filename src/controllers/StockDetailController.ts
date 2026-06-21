import { createResponse } from '../utils/response';
import { Env } from '../index';

/**
 * 个股详情控制器
 * - 财务分析（东方财富 datacenter）
 * - 公司公告（东方财富 datacenter）
 * - 个股新闻（东方财富资讯）
 */

/** 个股财务分析 */
export class StockFinanceController {
    /** /api/cn/stock/finance?symbol=002594 */
    static async getFinance(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get('symbol') || '').trim();
        if (!symbol || symbol.length !== 6) {
            return createResponse(400, '缺少 symbol 参数，示例: ?symbol=002594');
        }

        try {
            // 东方财富 datacenter 主要财务指标
            const apiUrl = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE%3D%22${symbol}%22)&pageSize=4&pageNumber=1&sortColumns=REPORT_DATE&sortTypes=-1`;

            const resp = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://data.eastmoney.com/',
                },
            });

            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();

            if (!json.result?.data?.length) {
                return createResponse(200, 'success', { '财务数据': [], debug_message: json.message });
            }

            const list = json.result.data.map((item: any) => ({
                '报告期': item.REPORT_DATE ? item.REPORT_DATE.split(' ')[0] : '--',
                '每股收益': item.BASIC_EPS != null ? item.BASIC_EPS.toFixed(4) : '--',
                '营业总收入': item.TOTAL_OPERATE_INCOME ? (item.TOTAL_OPERATE_INCOME / 1e8).toFixed(2) + '亿' : '--',
                '营收同比增长': item.TOTAL_OPERATE_INCOME_YOY != null ? item.TOTAL_OPERATE_INCOME_YOY.toFixed(2) + '%' : '--',
                '归母净利润': item.PARENT_NETPROFIT ? (item.PARENT_NETPROFIT / 1e8).toFixed(2) + '亿' : '--',
                '净利润同比增长': item.PARENT_NETPROFIT_YOY != null ? item.PARENT_NETPROFIT_YOY.toFixed(2) + '%' : '--',
                '净资产收益率': item.WEIGHTAVG_ROE != null ? item.WEIGHTAVG_ROE.toFixed(2) + '%' : '--',
                '毛利率': item.GROSS_PROFIT_RATIO != null ? item.GROSS_PROFIT_RATIO.toFixed(2) + '%' : '--',
                '资产负债率': item.DEBT_ASSET_RATIO != null ? item.DEBT_ASSET_RATIO.toFixed(2) + '%' : '--',
                '每股净资产': item.BPS != null ? item.BPS.toFixed(2) : '--',
                '每股经营现金流': item.MGJYXJJE != null ? item.MGJYXJJE.toFixed(4) : '--',
            }));

            return createResponse(200, 'success', {
                '来源': '东方财富',
                '代码': symbol,
                '财务数据': list,
            });
        } catch (err: any) {
            return createResponse(500, err.message);
        }
    }
}

/** 公司公告 */
export class StockAnnouncementController {
    /** /api/cn/stock/announcements?symbol=002594 */
    static async getAnnouncements(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get('symbol') || '').trim();
        if (!symbol || symbol.length !== 6) {
            return createResponse(400, '缺少 symbol 参数');
        }

        try {
            const apiUrl = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=20&page_index=1&ann_type=A&client_source=web&stock_list=${symbol}`;

            const resp = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://data.eastmoney.com/',
                },
            });

            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
            const json: any = await resp.json();

            const items = json.data?.list || [];
            const list = items.map((item: any) => ({
                '标题': item.title || '--',
                '公告日期': item.notice_date ? item.notice_date.split(' ')[0] : '--',
                '来源': item.columns?.[0]?.column_name || '--',
                '链接': item.art_code ? `https://data.eastmoney.com/notices/detail/${symbol}/${item.art_code}.html` : '',
            }));

            return createResponse(200, 'success', {
                '来源': '东方财富',
                '代码': symbol,
                '总数': list.length,
                '公告列表': list,
            });
        } catch (err: any) {
            return createResponse(500, err.message);
        }
    }
}

/** 个股新闻 */
export class StockNewsController {
    /** /api/cn/stock/news?symbol=002594 */
    static async getNews(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get('symbol') || '').trim();
        if (!symbol || symbol.length !== 6) {
            return createResponse(400, '缺少 symbol 参数');
        }

        try {
            // 东方财富个股新闻
            const apiUrl = `https://search-api-web.eastmoney.com/search/jsonp?cb=&param=%7B%22uid%22%3A%22%22%2C%22keyword%22%3A%22${symbol}%22%2C%22type%22%3A%5B%22cmsArticleWebOld%22%5D%2C%22client%22%3A%22web%22%2C%22clientType%22%3A%22web%22%2C%22clientVersion%22%3A%22curr%22%2C%22param%22%3A%7B%22cmsArticleWebOld%22%3A%7B%22searchScope%22%3A%22default%22%2C%22sort%22%3A%22default%22%2C%22pageIndex%22%3A1%2C%22pageSize%22%3A20%2C%22preTag%22%3A%22%22%2C%22postTag%22%3A%22%22%7D%7D%7D`;

            const resp = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://so.eastmoney.com/',
                },
            });

            if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);

            const text = await resp.text();
            // jsonp 格式: callback({...}) 或直接 json
            const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '') || text;
            const json = JSON.parse(jsonStr);

            const items = json.result?.cmsArticleWebOld || [];
            const list = items.map((item: any) => ({
                '标题': item.title?.replace(/<[^>]+>/g, '') || '--',
                '来源': item.mediaName || '--',
                '时间': item.date || '--',
                '摘要': item.content?.replace(/<[^>]+>/g, '').slice(0, 100) || '',
                '链接': item.url || '',
            }));

            return createResponse(200, 'success', {
                '来源': '东方财富',
                '代码': symbol,
                '新闻列表': list,
            });
        } catch (err: any) {
            return createResponse(500, err.message);
        }
    }
}
