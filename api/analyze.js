// 一坨咖啡 · AI 財務分析（Vercel Serverless Function）
// 前端（老闆後台 損益預測 頁）POST { token, data } 進來：
//   token = Supabase access token（用來驗證是 owner 本人）
//   data  = 損益月報 + 現金水位 + 健康指數的原始數字
// 驗證通過後把數字餵給 Claude Opus 5 做財務分析，回傳 Markdown 文字。
// ANTHROPIC_API_KEY 只存在 Vercel 環境變數，永遠不落地前端。

import Anthropic from '@anthropic-ai/sdk';

const SB_URL = 'https://ntmvivvhdapbckljevck.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bXZpdnZoZGFwYmNrbGpldmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjQxMzQsImV4cCI6MjA5NTAwMDEzNH0._gbJVonrWzePykEsVZIQ0tyvqNQAFpQhA24JZXYBrHo';

const SYSTEM = `你是一位專精台灣獨立咖啡廳的財務顧問（會計師背景，看過上百間店的帳），現在為「一坨咖啡」的老闆做財務分析。老闆是內行人，直接講重點。

分析規則（嚴格遵守）：
- 每一個判斷都必須引用具體數字（NT$ 金額、百分比、月份）。禁止空泛套話，例如「持續努力」「加強成本管理」「值得關注」這類沒有資訊量的句子一律不准出現。
- 對照台灣餐飲／咖啡業常見基準：銷貨成本率（COGS÷銷貨淨額）約 25–35%、人事費率約 25–35%、租金率最好 <15%、營業淨利率 10–20% 算健康。指出這間店每項落在哪裡、偏高偏低多少。
- 找趨勢與異常：月環比變化超過 ±15% 的科目要點名，能從資料推測原因就推測（例如叫貨集中、季節性），推測不出來就明說「資料看不出原因，建議查 X」。
- 行動建議 3–5 條，每條要具體可執行，並用現有數字估算預期影響金額（標明計算假設）。優先順序按影響金額排。
- 資料只有幾個月就坦白說樣本有限，哪些結論可信度較低。不要硬掰。
- 繁體中文、台灣用語，金額用 NT$ 千分位。

排版要求（這份會排成報告列印，嚴格遵守）：
- 以條列為主，每點一行、講一件事；段落最多 2 句就換行。禁止超過 3 行的大段落。
- 關鍵數字與結論用 **粗體**。
- 全文精簡有力，總長控制在 1,200 字以內。

輸出格式（Markdown）：
## 總體判斷
（2–3 句：這間店現在健不健康、最大的一個問題是什麼）
## 收入與毛利
## 費用結構
## 現金與風險
## 行動建議
（編號列表，每條含預期影響金額與假設）
## 資料缺口
（若有；沒有就省略此節）`;

const LEGEND = `欄位對照：revenue_gross=含稅營收、tax=稅額(5%)、net_sales=銷貨收入淨額、cost_beans=咖啡豆、cost_food=食材、cost_packaging=耗材(杯子包裝)、cost_other_cogs=其他銷貨成本、cogs=銷貨成本合計、gross=毛利、salary=薪資津貼(含勞健保)、misc_purchase=雜項購置、water_gas=水費+瓦斯、electric=電費、equip_repair=設備維修、equip_maintain=設備保養、other_ctrl=其他可控費用、fee=金流手續費(LINE Pay等)、ctrl=可控費用合計、rent=租金、parking=車位、amort_decor=裝潢攤提、amort_equip=設備攤提、system_fee=POS系統費、unctrl=不可控費用合計、opnet=營業淨利。金額單位都是新台幣元。`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '尚未設定 ANTHROPIC_API_KEY（到 Vercel 專案環境變數新增後 redeploy）' });
  }

  const { token, data } = req.body || {};
  if (!token || !data) return res.status(400).json({ error: 'missing token or data' });

  // ── 驗證：token 有效 且 staff.role === 'owner' ──
  try {
    const uRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
    });
    if (!uRes.ok) return res.status(401).json({ error: '登入已過期，請重新登入' });
    const user = await uRes.json();
    const sRes = await fetch(`${SB_URL}/rest/v1/staff?id=eq.${user.id}&select=role,is_active`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
    });
    const rows = await sRes.json();
    if (!Array.isArray(rows) || !rows[0] || rows[0].role !== 'owner' || rows[0].is_active === false) {
      return res.status(403).json({ error: '只有老闆帳號可以使用 AI 分析' });
    }
  } catch {
    return res.status(401).json({ error: '身分驗證失敗' });
  }

  // ── 呼叫 Claude Opus 5（adaptive thinking 預設開啟，會先深度思考再回答）──
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' },   // 兼顧深度與速度（約 30–90 秒）
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `今天日期：${new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}\n\n${LEGEND}\n\n以下是「一坨咖啡」的財務數字（JSON）：\n${JSON.stringify(data)}`,
      }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(500).json({ error: '模型拒絕了這次請求，請稍後再試' });
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return res.status(500).json({ error: '模型沒有回傳內容，請重試' });

    // 自動存檔到 ai_analyses（用 owner 的 token 寫入，RLS 只允許 owner）
    // 就算使用者關了瀏覽器，這筆分析也不會丟
    let savedId = null;
    try {
      const ins = await fetch(`${SB_URL}/rest/v1/ai_analyses`, {
        method: 'POST',
        headers: {
          apikey: SB_ANON, Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({
          year: data['年度'] || null,
          content: text,
          tokens_in: response.usage.input_tokens,
          tokens_out: response.usage.output_tokens,
        }),
      });
      if (ins.ok) { const rows = await ins.json(); savedId = rows[0]?.id || null; }
    } catch { /* 存檔失敗不影響回傳分析結果 */ }

    return res.status(200).json({
      text,
      saved_id: savedId,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (e) {
    const msg = e?.status === 401 ? 'API 金鑰無效，請檢查 ANTHROPIC_API_KEY'
      : e?.status === 429 ? '請求太頻繁，等一下再試'
      : `分析失敗：${e?.message || '未知錯誤'}`;
    return res.status(500).json({ error: msg });
  }
}
