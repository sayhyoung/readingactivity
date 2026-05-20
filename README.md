# 🏫 윤선생 내신 프렙

AI 기반 영어 지문 분석 및 학습 자료 생성 도구. 이미지에서 영어 지문을 OCR로 추출한 뒤, Vertex AI(Gemini)를 이용해 워크시트 활동과 내신 대비 문항을 자동 생성합니다.

## ✨ 주요 기능

- **OCR 추출**: 카메라 촬영 또는 이미지 업로드로 영어 지문 자동 추출 (Gemini Vision)
- **워크시트 생성**: 단어/표현 익히기, 문장 해석, 빈칸 채우기, 문장 재배열, 영작
- **시험 대비 문항**: 주제 파악, 내용 일치, 어법, 어휘, 빈칸 완성, 문장 순서/삽입, 주관식
- **국문 해석 자동 생성**

## 🛠 기술 스택

- **Frontend**: 정적 HTML/CSS/JS (Firebase Hosting)
- **Backend**: Node 20, Express, Cloud Functions for Firebase
- **AI**: Google Vertex AI — Gemini 2.0 Flash (OCR & 생성)

## 📁 프로젝트 구조

```
reading-project/
├── public/              # 정적 사이트 (Firebase Hosting)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── 404.html
├── functions/           # Cloud Functions API
│   ├── index.js         # /api/ocr, /api/activity, /api/exam
│   └── package.json
├── firebase.json
└── .firebaserc
```

## 🚀 로컬 실행

### 사전 준비

- Node.js 20
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud 프로젝트 + Vertex AI API 활성화
- `firebase login` 인증

### 의존성 설치

```bash
cd functions
npm install
```

### 에뮬레이터 실행

```bash
firebase emulators:start
```

## 🌐 배포

```bash
# 전체 배포
firebase deploy

# 함수만
firebase deploy --only functions

# 호스팅만
firebase deploy --only hosting
```

## 🔌 API 엔드포인트

| Method | Path             | 설명                          |
| ------ | ---------------- | ----------------------------- |
| POST   | `/api/ocr`       | 이미지에서 영어 텍스트 추출   |
| POST   | `/api/activity`  | 워크시트 활동 생성            |
| POST   | `/api/exam`      | 내신 대비 문항 생성           |

## 📝 라이선스

내부 사용 (비공개)
