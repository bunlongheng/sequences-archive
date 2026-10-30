<div align="center">

# <img src="docs/icon.png" width="36" height="36" align="top" alt=""> Sequences

Sequence diagrams you can point at by step number. AI-friendly, AI-compatible, AI-driven, AI built in: an agent creates one over MCP or the API, any model writes the syntax for you to paste, and plain English generation ships inside. Every diagram renders to a crisp SVG you can drop into a README.

[![CI](https://github.com/bunlongheng/sequences/actions/workflows/ci.yml/badge.svg)](https://github.com/bunlongheng/sequences/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-400%20unit%20%2B%2030%20e2e-34C759)

<img src="docs/screenshots/hero.webp" alt="Sequences: a 5-participant diagram with numbered steps, coloured lines and the Format panel open" width="900">

**Live:** [sequences-bheng.vercel.app](https://sequences-bheng.vercel.app) &middot; **Demo wall:** [/demo](https://sequences-bheng.vercel.app/demo)

</div>

## Read this before you clone

This is a working app, not a library. It needs 3 things from you, and 1 more if you want the AI part.

| You provide | Why | Free option |
|---|---|---|
| **Postgres** | Every diagram lives here, no SQLite fallback | Neon, Supabase, Railway |
| **Google OAuth** | The only sign-in, 1 owner email | Google Cloud Console |
| **A host** | A Next.js server, not a static site | Vercel, or localhost |
| **Anthropic key** | Plain-English generation only | optional |

## 3 ways to get a diagram

**1. An agent makes it.** Over MCP or the POST API, so a coding agent, a script or a CI job writes straight into your library.

**2. Any AI writes the syntax.** Ask Gemini, ChatGPT or anything else for Mermaid `sequenceDiagram` code, then paste it anywhere on the page. It picks up the title, saves the diagram and opens it. No key, nothing to configure.

**3. curl the SVG into your docs.** 1 request returns a self-contained SVG for a README, Confluence or Notion page.

```bash
# create and get the markup back in 1 call
curl -s -X POST "$APP/api/ai/sequences?format=svg" \
  -H "Authorization: Bearer $SEQUENCES_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"Login","code":"sequenceDiagram\n  U->>A: Login\n  A-->>U: Token"}'

# or point at one that already exists
curl -s "$APP/svg/<id>" -o login.svg
```

In a README, the URL is the image: `![Login]($APP/svg/<id>)`.

## Built for the meeting, not just the screenshot

- **Press Play and present it.** Fullscreen, then click any message to light it up while you talk. Numbered steps give the room one reference: "step 7", not "that arrow near the middle".
- **Every participant looks like what it is.** 26 icons, chosen from the label and never repeated inside a diagram, so a person, a browser, a database and a file are told apart at a glance. Override the icon, the label or the colour on any of them.
- **It lays itself out.** Auto layout reads the content and picks the row pitch, column widths and margins, so a 20-message diagram opens compact with nothing overlapping and no message cut off. 6 sliders are there when you disagree.
- **Looks finished.** 3 themes, 5 box treatments, coloured lifelines, message pills, and notes and step numbers you can switch off.
- **Share it in a click.** A link or a QR code to put it in front of your team for feedback, plus PNG, SVG, the Mermaid source, or the SVG straight onto your clipboard.

## Quick start

```bash
git clone https://github.com/bunlongheng/sequences.git
cd sequences
cp .env.local.example .env.local   # fill in DATABASE_URL, Google OAuth, OWNER_EMAIL
npm install
npm run migrate                    # applies db/migrations to a fresh database
npm run dev                        # http://localhost:3002
```

## Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | Postgres connection. `DATABASE_SSL=true` for a remote host |
| `AUTH_SECRET` | NextAuth v5 secret. `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth. Redirect URI is `/api/auth/callback/google` |
| `OWNER_EMAIL`, `OWNER_USER_ID` | The 1 account that can sign in, and the id its rows are stored under |
| `SEQUENCES_API_SECRET` | Bearer for `POST /api/ai/sequences` and the MCP server |
| `ANTHROPIC_API_KEY` | Plain-English generation only. Leave unset to disable it |
| `NEXT_PUBLIC_APP_URL` | Absolute links in API responses and share pages |

## API

| Route | What |
|---|---|
| `POST /api/ai/sequences` | Create from `{title, code}`, Bearer auth |
| `GET /svg/<id>` | The SVG. `?title=0` drops the heading |
| `GET /s/<id>` | Share page with OG image |
| `GET /demo` | The public demo wall |

**MCP.** `mcp/server.mjs` exposes `create_sequence`, `list_sequences`, `get_sequence`, `update_sequence`, `delete_sequence` and `get_sequence_schema` over stdio. Register it with your agent and point `SEQUENCES_API_SECRET` at your deployment. See [mcp/README.md](mcp/README.md).

## Contributing

Issues and pull requests are welcome. Run `npm run lint`, `npm run test` and `npm run test:e2e` before opening one.

---

<div align="center">

<a href="https://bunlongheng.com"><img src="https://img.shields.io/badge/-bunlongheng.com-3A3A3C?style=for-the-badge&amp;labelColor=2A2A2C&amp;logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y%2BmAAADAFBMVEXx8vLq6v%2F19fX09PT8%2Ff309PT5%2BfnAwMBMaXHx8vL19fX5%2Bfny8vL09PT39%2Ff6%2Bfn6%2Bvr09PTx8fH4%2BPn%2F8vLy8%2FP09PTz8%2FPy8vL%2F%2F%2F%2Fz9PTz9PP19fby8vP19PXz8%2FT19%2Fb08%2FTx8vLy8vL09vby8%2FL29vf19fTv8PDz9vb7%2Bvn%2F%2Ff%2F9%2Ff3w8vH29fb%2F%2FP339%2Ff5%2Bfn59%2Ff19PT09PR7rao3VF3%2F%2Fv8AKDR6sqsBV1vv8fL4%2BPiux8b8%2Bvq90NDy8%2FR%2BlpppnZyZqrACLTxclZJSkI9en5ssZ2luqaUAeWgqbW4BX1gCfG0%2Fa3QaVG0MN0UKNUKUpKsGpYMAKjoRQ1UDf3AQRloJqIgEm32d0cUBg3ElbnQIln8eVWgrmIdP0KzF5d5s2acdfHwppJCP5MMXl4Tz8%2FLv8%2FP39%2FiewL5%2BqahYf4IrTFZkk5KlxsREiIYAHiqDnKFmnJowc3IdVllvpKK7zc3D2tnk5%2BmuycdwpKKuub2yv8Ly%2B%2FkAMT7z%2Bvjq7e09gH93q6kGdWpGgoJZmJSlw8M7c3WwyceTw76w1M8mYmpFfX8lW2AFOEpGiYhxqqRrqaRb2rdIsZ8AVE91jpU7d3t3saqBoKhako4AWVEcUlg3aWwDupAHb2YwmIkPP1ERSVA7WmZ8tq8HT14oZW%2BYuLsMl3wQT10ROksENUc8Z3MJSGVLh4dqpJ%2BXr7U51awUgHM4v6ad1MkPuJZAiowVd3IEhnZH0aoYrI05p5sDtYwkzZ8EPViYxsRel5USbHAIgmwIM0gQamzU4uF2malQi4oWQFQ1zaYrp4UXlYwfiHoyxqFE1q4qeX4yn5JIxKkdrX1b1rAbWGvd5Oh91sRijpomsJEVc3Ukc34dqIcwuJVKwZIXkoQZcXlNv5g%2BqZUZvpNl2rPG9N0WkIoNqouW4sVPwp%2BM0b6h0ssfq4d%2F1r8hpo%2Fh9e4AamUjnI9avaBixqgklYWSwL4xtItUxplYl5qZ58mq78wMgnYXfnlOmJaR1L%2Bj78ny9fS%2FrXQPAAAAFXRSTlP7Brvx%2FsJhAgD87r4U72C4uGH8vhRDodYHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAC6UlEQVQokS2Sd3BUVRSHb0KS3QRCiZw5t%2By9j33zXjZkyUs2uekhEAi9dwRCL4JUEQRFAQUs9A4WOopKU0GpFoqCBZUivaqoFKkWLIS5GX7%2FfnPO78yZj%2Fj8UTViK6HggvNgSGuluEZRKbZqlN9H%2FFWiWUzIFQK5fhjOIRTDoqv4ia86S4q3KSByHdSqIhxofBKr5iNxLMm2bQqWVkorJ%2BAkO46nkQJhceSRmCTDvKJIJBLJzMxMLU6POJ4eBPF1KpNEbdt2Cms4LCcnZ%2FX6D3d%2BsKJJ7VSlNLoqgbjUtmkKKxlVmpf3bsFXW3d1b77gueJAQIPQBCilkMKemNi23Ts9T35%2FaMe2rsvmTypylGUFCSIYWJLXrm2nUwOPfNO5w%2B73Okxnjqe0JigQEL3JizoeONr%2F2u99vju4fd1rdZnyspQmnGvAUBprWNqz348%2FhXN%2F6P1%2By4Uvs%2FJkpRQRwpJBRVn7vf16Dfitz5XevQqWt3yalXtKaRIUQmglWfsu5y7%2BMrDs0TMftWo1ZVy64xioOVpcIdt8%2Fvqvf9%2F859KJsrLmrzA%2BOKC0IkFEtJza7JOfr%2FYd0P9G98tdOxe0Hp9qJrOIBgDuOeEtp%2F%2B4d%2FvWX%2F%2F9u%2B%2FtlaUTmOWZg7SQEEyuFe52%2BML9O3cZO%2F5xl06zn2VcadOJUqJTzt7a82XfP7sx9vmGNm1m1MstV4IHCVAAoTLqL1372ddn%2Fz%2B2v%2FWq12c1fSpsaeQWAZAANntxzuI3e3zbo8XGpm%2FMnNqiXrh%2BljaPd6UUabkjps19tdGnX2zKb9b4pTFDCzOMLmYtpW5h%2BpCRTeYtyV%2BT36zx808OL4xYGoFrkqDTbJpSXLdRgwbPZL%2BQnT129OOPFVEEsAMJpHKdeKMJgJSAiALdjJANQKnRJI4R6boAKEwLCiGoBBegQjBftQo1KQWOlplFKSV9qGaF1NpAE7QQESTlMSy6pp%2F4%2FFFVYxMNRBTaiM0tkImxNaL8vgfDR8gvoYRaxgAAAABJRU5ErkJggg%3D%3D" alt="bunlongheng.com"></a>
<a href="https://www.linkedin.com/in/bunlongheng/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="https://www.instagram.com/ibunlong/"><img src="https://img.shields.io/badge/Instagram-C13584?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
<a href="mailto:bheng.code@gmail.com"><img src="https://img.shields.io/badge/Email-2E7D32?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"></a>

<br>

Built by **[Bunlong](https://bunlongheng.com)** &nbsp;&middot;&nbsp; [more apps](https://bunlongheng.com/projects)

</div>
