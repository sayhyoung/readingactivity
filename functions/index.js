const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { VertexAI } = require("@google-cloud/vertexai");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '15mb' }));

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = "us-central1";

const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
});

// OCR 전용 고성능 모델
const visionModel = vertexAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    maxOutputTokens: 4096,
    temperature: 0.1,
  },
});

// 활동 생성용 모델
const generativeModel = vertexAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    maxOutputTokens: 8192, // 토큰 수 증가
    temperature: 0.4,      // 창의성 약간 증가 (선택지 중복 방지)
  },
});

app.use((req, res, next) => {
  console.log("Incoming request path:", req.path);
  next();
});

// OCR 엔드포인트
app.post(["/ocr", "/api/ocr"], async (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: "이미지 데이터가 없습니다." });
    }

    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, "");
    
    const prompt = `
이미지에서 영어 텍스트를 정확하게 추출해주세요.

규칙:
1. 모든 텍스트를 추출하되, 명백한 OCR 오류는 수정하세요
2. 줄바꿈과 문단 구조를 자연스럽게 유지하세요  
3. 특수문자는 올바른 영문자로 변환하세요
4. 손글씨나 불분명한 글자는 문맥상 적절한 단어로 추측하세요
5. 그림이나 장식 요소는 무시하고 텍스트만 추출하세요
6. 일반적인 영어 단어와 문법에 맞게 수정하세요
7. 추출된 텍스트만 출력하세요
`;

    const aiResp = await visionModel.generateContent({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: imageData.startsWith('data:image/png') ? "image/png" : "image/jpeg",
              data: base64Data
            }
          }
        ]
      }]
    });

    const extractedText = aiResp?.response?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    if (!extractedText.trim()) {
      return res.status(500).json({ error: "이미지에서 텍스트를 추출하지 못했습니다." });
    }

    const cleanedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2')
      .trim();

    return res.status(200).json({ text: cleanedText });

  } catch (error) {
    functions.logger.error("Gemini OCR 에러:", error?.message, error?.stack);
    return res.status(500).json({ error: "OCR 처리 중 오류가 발생했습니다: " + (error?.message || "Unknown") });
  }
});

// JSON 파싱 함수들
function extractAndParseJSON(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}") + 1;
  if (s >= 0 && e > s) {
    const jsonString = text.substring(s, e);
    try {
      return JSON.parse(jsonString);
    } catch (err) {
      functions.logger.error("JSON 파싱 실패:", jsonString, err);
      return null;
    }
  }
  return null;
}

function validateAndFixActivityJSON(jsonContent) {
  try {
    const firstTry = extractAndParseJSON(jsonContent);
    if (firstTry) return firstTry;
    const cleaned = jsonContent.replace(/```json/g, "").replace(/```/g, "").trim();
    const secondTry = extractAndParseJSON(cleaned);
    if (secondTry) return secondTry;
    throw new Error("유효한 JSON을 찾을 수 없습니다.");
  } catch (err) {
    throw new Error(`활동 JSON 파싱 실패: ${err.message}`);
  }
}

// 워크시트 활동 생성 엔드포인트
app.post(["/activity", "/api/activity"], async (req, res) => {
  try {
    const { passage, activities, activityConfigs } = req.body;
    
    if (!passage) {
      return res.status(400).json({ error: "지문이 비어있습니다." });
    }
    if (!Array.isArray(activities) || !activities.length) {
      return res.status(400).json({ error: "활동을 최소 한 개 이상 선택해야 합니다." });
    }

    functions.logger.info("🔥 요청된 워크시트 활동:", activities);

    let detailedInstructions = `다음 활동들만 정확히 생성하세요:\n`;
    let vocabInstructions = "";
    let gapFillInstructions = "";
    let sentenceUnscrambleInstructions = "";

    let activityIndex = 1;
    activities.forEach((activityType) => {
      const config = activityConfigs[activityType] || { count: 5 };
      detailedInstructions += `\n${activityIndex}. ${activityType}: ${config.count}개 문항`;
      activityIndex++;
      
      if (activityType === "단어 및 주요 표현 익히기") {
        const totalCount = config.count;
        const wordCount = Math.ceil(totalCount / 2);
        const phraseCount = Math.floor(totalCount / 2);
        
        detailedInstructions += ` (단어 ${wordCount}개 + 숙어/표현 ${phraseCount}개)`;
        vocabInstructions = `
【단어 및 주요 표현 익히기 특별 지시사항】
- 총 ${totalCount}개 문항 (단어 ${wordCount}개 + 숙어/표현 ${phraseCount}개)
- 단어는 반드시 기본형으로 표시 (동사 원형, 명사 단수형 등)
`;
      }
      
      if (activityType === "빈 칸 채우기") {
        const blankMode = config.blankMode || 'single';
        const blankDescription = blankMode === 'single' ? '1개의 빈칸' : '2개 이상의 빈칸';
        detailedInstructions += ` (각 문장마다 ${blankDescription})`;
        if (config.showKoreanTranslation) detailedInstructions += `, 한국어 해석 포함`;
        
        gapFillInstructions = `
【빈 칸 채우기 특별 지시사항】
- 빈칸은 반드시 언더스코어(_)만 사용하세요
- 예시: "beautiful" (9글자) → "_____________" (약 14개 언더스코어)
- ❌ 절대 사용 금지: ___[숫자]___, ___[6]___ 같은 형식
${config.showKoreanTranslation ? '- 한국어 해석(korean 필드)을 포함하세요' : '- 한국어 해석(korean 필드)은 제외하세요'}
`;
      }

      if (activityType === "문장 재배열 활동") {
        detailedInstructions += ` (첫 단어 자동 표시)`;
        if (config.showKoreanTranslation) detailedInstructions += `, 한국어 해석 포함`;
        
        sentenceUnscrambleInstructions = `
【문장 재배열 활동 특별 지시사항】
- 첫 단어는 firstWord에, 나머지는 shuffled에 콤마로 구분
${config.showKoreanTranslation ? '- 한국어 해석 포함' : '- 한국어 해석 제외'}
`;
      }
    });

    const systemInstructionContent = `
당신은 영어 학습 워크시트를 만드는 전문가입니다.
요청된 활동만 정확히 생성하세요.
응답은 반드시 유효한 JSON 형식이어야 합니다.
`;

    let jsonFormat = '{\n  "activities": [\n';
    const formatParts = [];
    
    if (activities.includes("단어 및 주요 표현 익히기")) {
      formatParts.push(`    {
      "type": "단어 및 주요 표현 익히기",
      "items": [{"vocab": "단어/숙어", "meaning": "한국어 뜻"}]
    }`);
    }
    
    if (activities.includes("영어 문장 해석하기")) {
      formatParts.push(`    {
      "type": "영어 문장 해석하기",
      "sentences": [{"original": "영어 문장", "answer": "한국어 해석"}]
    }`);
    }
    
    if (activities.includes("빈 칸 채우기")) {
      formatParts.push(`    {
      "type": "빈 칸 채우기",
      "questions": [{"sentence": "빈칸(___)이 포함된 문장", "korean": "한국어 해석(옵션)", "solution": "정답"}]
    }`);
    }
    
    if (activities.includes("문장 재배열 활동")) {
      formatParts.push(`    {
      "type": "문장 재배열 활동",
      "examples": [{"firstWord": "첫단어", "shuffled": "나머지, 단어들", "korean": "해석(옵션)", "answer": "완전한 문장"}]
    }`);
    }
    
    if (activities.includes("우리말 영어로 번역하기")) {
      formatParts.push(`    {
      "type": "우리말 영어로 번역하기",
      "list": [{"korean": "한국어 문장", "answer": "영어 번역"}]
    }`);
    }
    
    jsonFormat += formatParts.join(',\n') + '\n  ]\n}';

    const userPromptContent = `
${detailedInstructions}
${vocabInstructions}
${gapFillInstructions}
${sentenceUnscrambleInstructions}

[사용자 지문]
${passage}

[JSON 출력 형식]
${jsonFormat}
`.trim();

    const aiResp = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: userPromptContent }] }],
      systemInstruction: { role: "system", parts: [{ text: systemInstructionContent }] },
    });

    const content = aiResp?.response?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    if (!content) {
      return res.status(500).json({ error: "Gemini 응답이 비어있습니다." });
    }

    const result = validateAndFixActivityJSON(content);
    result.activities = result.activities.filter(act => activities.includes(act.type));
    result.activityConfigs = activityConfigs;

    return res.status(200).json({ result });
  } catch (error) {
    functions.logger.error("워크시트 생성 에러:", error?.message, error?.stack);
    return res.status(500).json({ error: "서버 내부 오류: " + (error?.message || "Unknown") });
  }
});

// 🆕 내신 대비 문항 생성 엔드포인트
app.post(["/exam", "/api/exam"], async (req, res) => {
  try {
    const { passage, activities, activityConfigs } = req.body;
    
    if (!passage) {
      return res.status(400).json({ error: "지문이 비어있습니다." });
    }
    if (!Array.isArray(activities) || !activities.length) {
      return res.status(400).json({ error: "문항 유형을 최소 한 개 이상 선택해야 합니다." });
    }

    functions.logger.info("🔥 요청된 문항:", activities);

    let detailedInstructions = `다음 시험 대비 문항들을 정확히 생성하세요:\n`;

    let activityIndex = 1;
    activities.forEach((activityType) => {
      const config = activityConfigs[activityType] || { count: 1 };
      detailedInstructions += `\n${activityIndex}. ${activityType}: ${config.count}개 문항`;
      activityIndex++;
    });

    const systemInstructionContent = `
당신은 중학교 영어 내신 시험 출제 전문가입니다.
실제 기출문제와 유사한 수준과 형식으로 문항을 생성하세요.

🚨 [매우 중요 - 지문 변형 규칙] 🚨
문제를 풀기 위해 지문에 표시(Marking)가 필요한 유형(어법, 어휘, 문장 삽입 등)은 반드시 **'변형된 지문'을 'passage' 필드에 포함**해야 합니다.

1. **지문 변형 및 마킹 규칙 (가장 중요)**:
   - 문제 유형이 '(a)~(e)'를 요구하는 경우(어법, 어휘 등), **반드시 지문 내에 5개의 마킹((a), (b), (c), (d), (e))을 모두 포함해야 합니다.**
   - 만약 틀린 부분이 1개뿐이라면, 나머지 4개는 올바른 표현에 마킹하여 오답(Distractor)으로 만드세요.
   - **절대 (a) 하나만 만들지 마세요. 무조건 (a)부터 (e)까지 5개를 강제로 만드세요.**
   - 마킹 형식: \`<u>(a) word</u>\`, \`<u>(b) phrase</u>\` 처럼 <u> 태그와 괄호를 함께 사용하세요.

2. **어법/어휘 문제**:
   - JSON의 \`passage\` 필드에 (a), (b), (c)와 같은 기호나 \`<u>...</u>\` 태그를 사용하여 타겟 단어를 명확히 표시한 전체 지문을 넣으세요.
   - 예: "passage": "Hello, my name is <u>(a) Tom</u>. I <u>(b) am</u> a student."

3. **문장 삽입 문제**:
   - JSON의 \`passage\` 필드에 문장이 들어갈 위치를 ①, ②, ③, ④, ⑤ 번호로 표시한 전체 지문을 넣으세요.
   - 예: "passage": "First sentence. ① Second sentence. ② Third sentence."

4. **선택지(choices) 생성 규칙**:
   - 정답을 제외한 나머지 오답(Distractor)들은 서로 내용이 중복되지 않아야 합니다.
   - 선택지 배열(choices)에는 반드시 5개의 서로 다른 문자열이 들어가야 합니다.

5. **일반 규칙**:
   - 모든 문항에 정답 해설(explanation) 포함.
   - 주제 및 목적 파악 문항의 선택지는 한국어로 작성.
`;

    let jsonFormat = '{\n  "activities": [\n';
    const formatParts = [];
    
    const examTypes = {
      "주제 및 목적 파악": {
        "type": "주제 및 목적 파악",
        "questions": [{
          "question": "다음 글의 주제로 가장 적절한 것은?",
          "choices": ["한국어 선택지1", "한국어 선택지2", "한국어 선택지3", "한국어 선택지4", "한국어 선택지5"],
          "answer": "③",
          "explanation": "해설"
        }]
      },
      "본문 내용 이해": {
        "type": "본문 내용 이해",
        "questions": [{
          "question": "다음 글의 내용과 일치하지 않는 것은?",
          "choices": ["한국어 선택지1", "한국어 선택지2", "한국어 선택지3", "한국어 선택지4", "한국어 선택지5"],
          "answer": "③",
          "explanation": "해설"
        }]
      },
      "어법 문제": {
        "type": "어법 문제",
        "questions": [{
          "question": "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
          "passage": "반드시 (a), (b), (c), (d), (e)와 <u> 태그로 마킹된 변형 지문 전체 내용",
          "choices": ["(a)", "(b)", "(c)", "(d)", "(e)"],
          "answer": "(c)",
          "explanation": "이유 설명"
        }]
      },
      "어휘 문제": {
        "type": "어휘 문제",
        "questions": [{
          "question": "다음 글의 (a)~(e) 중 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
          "passage": "반드시 (a), (b), (c), (d), (e)로 마킹된 변형 지문 전체 내용",
          "choices": ["(a)", "(b)", "(c)", "(d)", "(e)"],
          "answer": "②",
          "explanation": "이유 설명"
        }]
      },
      "빈칸 완성": {
        "type": "빈칸 완성",
        "questions": [{
          "question": "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
          "passage": "빈칸(________)이 포함된 지문 전체",
          "choices": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
          "answer": "④",
          "explanation": "해설"
        }]
      },
      "문장 순서 배열": {
        "type": "문장 순서 배열",
        "questions": [{
          "question": "주어진 글 다음에 이어질 순서로 가장 적절한 것은?",
          "passage": "[필수] 원문 시작부의 1~2문장을 '주어진 글'로 라벨 없이 먼저 작성 (예: Joseph loved his beard...). 두 줄 공백 후 본문 나머지를 (A), (B), (C)로 라벨링한 3문단을 무작위 순서로 배치. 절대 (A)/(B)/(C)만 출력하지 말 것 — 도입부 1~2문장이 반드시 먼저 와야 함.",
          "choices": ["(A)-(C)-(B)", "(B)-(A)-(C)", "(B)-(C)-(A)", "(C)-(A)-(B)", "(C)-(B)-(A)"],
          "answer": "②",
          "explanation": "해설"
        }]
      },
      "문장 삽입 위치": {
        "type": "문장 삽입 위치",
        "questions": [{
          "question": "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?\n\n주어진 문장: [영어 문장]",
          "passage": "①, ②, ③, ④, ⑤ 번호가 삽입된 변형 지문 전체",
          "choices": ["①", "②", "③", "④", "⑤"],
          "answer": "③",
          "explanation": "해설"
        }]
      }
      
    };
    
    // 사용자가 요청한 활동 타입에 맞춰 JSON 포맷 예시 추가
    activities.forEach(actType => {
      if (examTypes[actType]) {
        formatParts.push(`    ${JSON.stringify(examTypes[actType], null, 2).replace(/\n/g, '\n    ')}`);
      } else if (!activities.includes(actType)) {
         // 주관식 등 기타 유형 처리 (기존 로직 유지 가능)
      }
    });
    
    // 주관식 유형 처리
    if(activities.includes("주관식 영작")) {
         formatParts.push(`    {
            "type": "주관식 영작",
            "questions": [{
              "question": "다음 우리말과 일치하도록 괄호 안의 단어를 활용하여 영작하시오.\n\n[여기에 반드시 한국어 문장을 작성. 예: 그는 그에게 수염 기르기를 멈추라고 말했다.]\n(단어: word1, word2, word3, word4, word5, word6)",
              "answer": "정답 영문 문장",
              "explanation": "구문/문법 설명"
            }]
         }`);
    }
    if(activities.includes("주관식 요약문 완성")) {
         formatParts.push(`    {
            "type": "주관식 요약문 완성",
            "questions": [{
              "question": "위 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A)와 (B)에 들어갈 말을 본문에서 찾아 쓰시오.",
              "passage": "본문을 한 문장으로 요약한 새로운 요약문. 빈칸 두 개를 (A), (B) 형식으로 표시. 본문 문장을 그대로 복사하지 말 것. 같은 문장을 절대 두 번 반복하지 말 것. 길이는 30~60단어 1문장.",
              "answer": "(A) word1 / (B) word2",
              "explanation": "왜 그 단어가 정답인지 해설"
            }]
         }`);
    }

    jsonFormat += formatParts.join(',\n') + '\n  ]\n}';

    const userPromptContent = `
${detailedInstructions}
[경고]
- 어법/어휘 문제는 passage 필드에 반드시 (a)~(e) 5개의 선택지가 <u> 태그와 함께 존재해야 함.
- (a) 하나만 있으면 절대 안 됨.

[사용자 지문]
${passage}

[JSON 출력 형식]
${jsonFormat}

[중요 제약사항]
1. 어법, 어휘 문제는 반드시 passage 필드에 (a)~(e) 마킹과 <u> 태그가 적용된 지문을 보내야 합니다.
2. 문장 삽입 문제는 반드시 passage 필드에 ①~⑤ 번호가 적힌 지문을 보내야 합니다.
3. 선택지(choices)는 절대 중복되어서는 안 됩니다. 5개의 서로 다른 선택지를 만드세요.
4. JSON 형식만 출력하세요.
5. 주관식 요약문 완성 문제는 다음 규칙을 반드시 지키세요:
   - passage 필드에는 본문 전체가 아니라 **본문을 압축한 한 문장(30~60단어) 요약문**만 작성합니다.
   - 요약문 안에 **빈칸 두 개를 (A), (B) 형식으로 표시**합니다. 언더스코어(___)는 사용하지 마세요.
   - **본문 문장을 그대로 복사 금지**, **같은 문장을 두 번 반복 금지**, **questions 배열에 같은 내용 중복 금지**.
   - answer 필드는 "(A) word1 / (B) word2" 형식.
6. 주관식 영작 문제는 question 필드에 반드시 **세 부분**을 모두 포함해야 합니다:
   (1) 지시문: "다음 우리말과 일치하도록 괄호 안의 단어를 활용하여 영작하시오."
   (2) **한국어 우리말 문장** (절대 누락 금지, 영어로 쓰지 말 것)
   (3) 괄호 안 단어 목록: "(단어: word1, word2, ...)"
   - 세 부분은 줄바꿈(\n\n / \n)으로 구분합니다.
   - 우리말 문장은 answer 필드의 영문 정답과 의미가 일치해야 합니다.
7. 문장 순서 배열 문제는 passage 필드에 반드시 **두 부분**을 모두 포함해야 합니다 (이 유형이 단독 출제되더라도 동일):
   (1) **'주어진 글' (도입부)**: 원문 시작부의 1~2문장을 라벨 없이 그대로 작성. 절대 누락 금지.
   (2) **(A), (B), (C) 3개 문단**: 본문 나머지를 세 문단으로 나누어 (A), (B), (C) 라벨을 붙여 무작위 순서로 배치.
   - 두 부분 사이는 줄바꿈 두 번(\n\n)으로 구분.
   - 절대 (A)/(B)/(C)만 출력하지 마세요. 도입부 1~2문장이 반드시 먼저 와야 합니다.
`.trim();

    const aiResp = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: userPromptContent }] }],
      systemInstruction: { role: "system", parts: [{ text: systemInstructionContent }] },
    });

    const content = aiResp?.response?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    if (!content) {
      return res.status(500).json({ error: "Gemini 응답이 비어있습니다." });
    }

    const result = validateAndFixActivityJSON(content);
    result.activities = result.activities.filter(act => activities.includes(act.type));
    result.activityConfigs = activityConfigs;

    // 국문 해석 생성
    try {
      const translationPrompt = `다음 영어 지문을 자연스러운 한국어로 번역하세요. 번역문만 출력하세요.\n\n${passage}`;
      const translationResp = await generativeModel.generateContent({
        contents: [{ role: "user", parts: [{ text: translationPrompt }] }]
      });
      const translation = translationResp?.response?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      result.translation = translation.trim();
    } catch (transErr) {
      functions.logger.warn("국문 해석 생성 실패:", transErr?.message);
      result.translation = "국문 해석을 생성할 수 없습니다.";
    }

    return res.status(200).json({ result });
  } catch (error) {
    functions.logger.error("문항 생성 에러:", error?.message, error?.stack);
    return res.status(500).json({ error: "서버 내부 오류: " + (error?.message || "Unknown") });
  }
});

exports.api = functions.region("us-central1").https.onRequest(app);