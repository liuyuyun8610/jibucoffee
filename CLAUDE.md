# 一坨咖啡與生活選物 — 給 Claude 的工作規則

這個專案有兩個人在改：店主（voyagechochi）和 liuyuyun8610。兩台電腦各有一份，靠 GitHub 同步。

## 網站結構（純 HTML + Supabase，沒有 build 步驟）
- `index.html` 前台首頁、`menu.html` 店內菜單、`shop/` 商品圖
- `admin.html` 網站後台（商品、菜單、公休日、網站設定）
- `staff/` 員工系統：`login` 登入、`me` 員工打卡、`pt` 臨時PT、`manage.html` + `manage.js` 內部管理（排班、薪資、帳本、損益…）、`payslip` 薪資單、`recipes` 配方、`report` AI 財務分析
- `config.js` Supabase 公開連線設定（anon key，本來就公開，安全靠 RLS）
- `api/analyze.js` Vercel 函式（AI 財務分析，金鑰在 Vercel 環境變數）
- `db/` 資料庫 migration，依編號排；`supabase/functions/` Edge Functions

## 每次工作的固定流程
1. 開工先 `git checkout main && git pull`，拿到另一個人的最新修改。
2. 開新分支：`git checkout -b <簡短英文描述>`，例如 `menu-new-drinks`。**不要直接在 main 上改、不要 push main。**
3. 改完在本機預覽：`python3 -m http.server 8000`，開 http://localhost:8000/ 檢查（`/api/analyze` 本機不會動，屬正常）。
4. 確認沒問題再 commit（訊息用中文寫清楚改了什麼），`git push -u origin <分支>`，然後用 `gh pr create` 開 PR，標題、說明都用中文。
5. 合併 PR 以後，Vercel 會自動更新正式站 jibucoffee.vercel.app。合併前可以請 liuyuyun8610 看一下。

## 不能做的事
- 不改 `config.js`、`vercel.json`、`package.json`、`api/`、`supabase/functions/`，除非使用者明確要求。
- **不動資料庫**：不跑 SQL，也不改 RLS。需要新增欄位或資料表時，在 `db/` 依序新增下一個編號的 `.sql` 檔，並在 PR 說明寫「需要執行 migration」，交給 liuyuyun8610 執行。
- 不把任何金鑰、密碼、token 寫進檔案或 commit（這個 repo 是公開的）。
- 不 force push、不刪分支、不改寫 git 歷史。
- 大幅改版或刪功能前，先跟使用者確認。

## 風格
- 介面文字用繁體中文，沿用現有的顏色、字體、間距，新的 UI 抄既有元件的寫法。
- 圖示用 SVG，不用 emoji。
- 回覆使用者時簡短說明改了什麼，並附上預覽方式。
