# 한칸 — Vercel 배포용 전체 코드

1,200칸 원고지에 글과 손글씨를 담는 웹사이트입니다.
현재 버전은 **25칸 × 48줄**, **최대 3권**, **한 권에 최대 12장**을 지원합니다.

## 기능

- 장마다 원고지 / 백지 / 모눈종이 선택
- 글자 수 자동 계산, 원고지 문단·문장부호·숫자/영문 배치
- Pretendard 폰트, 태블릿 펜 입력과 획 지우기
- 현재 권 전체를 A4 PDF 파일로 다운로드: 제목·글·필기·종이 형식 포함
- 책장 전체를 JSON 백업 파일로 내보내고 불러오기
- 같은 기기·브라우저에서 IndexedDB 자동 저장
- 되돌리기 / 다시 하기, 자동 장 넘김

## 저장 방식

이 버전은 데이터베이스나 API 키 설정 없이 Vercel에 배포할 수 있습니다.
글과 필기는 **이 사이트를 연 기기·브라우저**에 저장됩니다.
다른 기기나 다른 도메인으로 자동 동기화되지는 않습니다.
브라우저 데이터 삭제, 시크릿 창 종료 전에 필요한 책장을 백업하세요.

기존 한칸 사이트에서 작성한 글을 옮기려면:

1. 기존 사이트 https://hankan.stopwonee.chatgpt.site 를 엽니다.
2. 왼쪽 책장의 **책장 백업** 버튼으로 JSON 파일을 내려받습니다.
3. 새 Vercel 사이트에서 **불러오기** 버튼으로 그 파일을 선택합니다.
4. 제목·글·손글씨·장별 종이 형식이 함께 옮겨집니다.

PDF는 현재 선택한 권의 모든 장을 포함합니다.
필기와 칸 배치를 보존하기 위해 각 장을 고해상도 이미지로 넣습니다.
PDF 안의 글은 텍스트 선택·검색 대상이 아니며, 편집 가능한 원고는 JSON 백업으로 보관합니다.

## 내 컴퓨터에서 실행

Node.js 22와 npm을 설치합니다. 압축을 푼 프로젝트 폴더에서:

~~~sh
npm ci
npm run dev
~~~

브라우저에서 http://localhost:3000 을 엽니다.

~~~sh
npm run build
npm start
~~~

환경 변수, 로그인 설정, 외부 데이터베이스는 필요하지 않습니다.

## GitHub에 올리기

GitHub에서 새로운 저장소를 만듭니다. 예를 들어 저장소 이름은 hankan입니다.
처음 생성할 때 README, .gitignore, License 자동 추가는 선택하지 않습니다.
압축 파일 자체가 아니라 **압축을 푼 프로젝트 폴더의 내용**을 올립니다.

프로젝트 폴더에서 터미널을 열고:

~~~sh
git init
git add .
git commit -m "Create Hankan writing app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hankan.git
git push -u origin main
~~~

YOUR_USERNAME은 본인의 GitHub 사용자 이름으로 바꿉니다.
GitHub CLI·GitHub Desktop 또는 토큰/SSH 등 본인의 기존 GitHub 인증을 사용합니다.
저장소 루트에 package.json, package-lock.json, app 폴더가 있어야 합니다.

## Vercel에서 배포

1. https://vercel.com 에서 GitHub 계정으로 로그인합니다.
2. Add New → Project에서 위 GitHub 저장소를 Import합니다.
3. 아래 설정을 확인하고 Deploy를 누릅니다.

| 항목 | 값 |
| --- | --- |
| Project Name | hankan 또는 사용 가능한 원하는 이름 |
| Framework Preset | Next.js |
| Root Directory | 프로젝트 루트 |
| Install Command | npm ci |
| Build Command | npm run build |
| Output Directory | 기본값 |
| Node.js Version | 22.x |
| Environment Variables | 없음 |

vercel.json에 프레임워크·설치·빌드 설정이 포함되어 있습니다.
사용 가능한 이름에 따라 Vercel 주소가 정해집니다.
이후 main 브랜치에 변경 사항을 push하면 연결된 프로젝트가 새 버전을 배포합니다.

## 코드 구조

- app/notebook-editor.tsx: 책장·작성 화면·펜 입력·다운로드 버튼
- app/globals.css: 종이와 글씨 스타일
- lib/notebook.ts: 1,200칸 배치·장 넘김·문서 검증
- lib/local-notebook.ts: IndexedDB 자동 저장과 다른 탭 수정 충돌 처리
- lib/notebook-pdf.ts: A4 PDF 생성
- lib/notebook-backup.ts: 책장 JSON 백업 및 복원 검증
- public/fonts/: Pretendard 폰트와 라이선스
- vendor/: PDF-LIB 및 스타일 자산과 라이선스
- checks/: 원고지·책장·백업·브라우저 저장 검사

## 검증

~~~sh
npm test
npm run check
npm run build
~~~

검사는 Node.js 22.13 이상에서 실행합니다.
기존 1,000칸 종이의 필기는 1,200칸 종이에서도 위치를 유지하도록 변환되며,
백업을 여러 번 불러와도 반복해서 줄어들지 않습니다.

## 참고 문서

- Next.js 배포: https://nextjs.org/docs/app/getting-started/deploying
- Vercel Next.js: https://vercel.com/docs/frameworks/full-stack/nextjs
- GitHub에 로컬 코드 올리기: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- PDF-LIB: https://pdf-lib.js.org

사이트 원본의 Sites 전용 프로젝트 설정, Cloudflare 저장소 API, 전용 빌드 및 인증 코드가 없는 독립 Next.js 프로젝트입니다.

