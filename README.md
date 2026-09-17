# Experiment Hub

計測・可視化・画像処理の実験ページ集。

https://dambara0419.github.io/my-github-pages/

## 構成

- [Astro](https://astro.build/) 7（静的サイト生成）＋ React 19（動くパーツ）
- Tailwind CSS 4
- GitHub Pages（GitHub Actions で自動公開）

```
src/
  pages/        ← 1ファイル = 1ページ（.astro）
  components/   ← 各ツールの React コンポーネント（.jsx）
  layouts/      ← 全ページ共通の <head> など
  styles/       ← Tailwind の読み込み
  utils/        ← withBase()：/my-github-pages 付きのリンクを作る
public/         ← そのまま公開されるファイル（thatcher.html など）
```

## 使い方

```bash
npm install
npm run dev       # 開発サーバー → http://localhost:4321/my-github-pages/
npm run lint
npm run build     # dist/ に書き出し
```

## 公開

main に push すると、GitHub Actions が自動でビルドして公開する（1〜2分）。

- 進み具合・失敗の確認：GitHub の **Actions** タブ
- 手動で公開し直す：Actions タブ →「Deploy to GitHub Pages」→ **Run workflow**
- 公開したくない作業は main 以外のブランチに push する
