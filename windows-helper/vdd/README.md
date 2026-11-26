# DuoDesk Virtual Display Driver（ARM64 / x64 IddCx UMDF 2.x）

DuoDesk の「画面を共有 › 拡張（Extend）」機能向けに設計された、**Windows 11 ARM64 および x64 両対応**の Indirect Display Driver（`Root\DuoDeskVDD`）です。

- **GPU ゼロコピー処理**: Direct3D 11 / DXGI スワップチェーンをシステム GPU（Qualcomm Adreno X1 / NVIDIA / AMD / Intel）上で実行
- **カスタム解像度対応**: `C:\VirtualDisplayDriver\vdd_settings.xml` から解像度・リフレッシュレートを動的読み込み
- **DuoDesk 本体との自動連携**: `windows/vdd.js` および `windows/scripts/vdd-status.ps1` が `Root\DuoDeskVDD` を最優先で認識します

---

## 1. ビルドに必要な環境
1. **Visual Studio 2022**（「C++ によるデスクトップ開発」および ARM64 / x64 ビルドツール）
2. **Windows 11 SDK** および **Windows 11 WDK（Windows Driver Kit）**

## 2. ビルド方法
```cmd
cd windows-helper\vdd
build.cmd all --cab
```
- `out\ARM64\Release\DuoDeskVdd\`（ARM64 用 `.dll` / `.inf` / `.cat`）
- `out\x64\Release\DuoDeskVdd\`（x64 用 `.dll` / `.inf` / `.cat`）
- `--cab` を付けると、Microsoft Partner Center 提出用の `DuoDeskVdd-ARM64.cab` / `DuoDeskVdd-x64.cab` が自動生成されます。

---

## 3. Windows 11 ARM64 向けの本番配布（Microsoft Attestation Signing）
Windows 11 on ARM64 の通常環境（Secure Boot / Code Integrity 有効）でエラー `0x800B0109` を出さずにインストールするには、以下の公式手順で Microsoft 署名を取得します。

1. **EV コードサイニング証明書**で `DuoDeskVdd-ARM64.cab`（および `DuoDeskVdd-x64.cab`）に署名します：
   ```cmd
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a out\ARM64\Release\DuoDeskVdd-ARM64.cab
   ```
2. **Microsoft Partner Center（Hardware Dev Center）** にログインし、**「ハードウェア › ドライバー › 新しいハードウェアの提出」** から署名済み `.cab` をアップロードします（ターゲット OS として Windows 11 ARM64 / x64 を選択）。
3. 構成証明署名（Attestation Signing）が完了したら、Microsoft 署名済みの `.dll` / `.inf` / `.cat` パッケージをダウンロードして配布します。

---

## 4. 開発・検証環境でのインストール手順（テスト署名モード）
社内検証機などテスト署名モードが許可された端末でのみ、以下の手順でローカルビルドをテストできます：

```cmd
:: 管理者権限コマンドプロンプト（再起動が必要 / Secure Boot オフ環境）
bcdedit /set testsigning on
```
再起動後、生成されたパッケージに対して：
```cmd
pnputil /add-driver out\ARM64\Release\DuoDeskVdd\DuoDeskVdd.inf
..\bin\macshare-winhelper.exe --add-root-device out\ARM64\Release\DuoDeskVdd\DuoDeskVdd.inf Root\DuoDeskVDD
```
