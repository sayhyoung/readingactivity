/**
 * exam-pdf-generator.js
 * --------------------------------------------------------------------------
 * Reading-comprehension exam PDF generator.
 * Renders an A4 portrait exam paper with shared main passage, per-question
 * blocks, optional answer key (with summary table + per-item explanations),
 * and optional Korean translation.
 *
 * Based on the jsPDF + NanumGothic approach from handoff/pdf-worksheet-generator.js.
 * Choice markers (①②③④⑤) and answer markers are drawn as graphical circles
 * via pdf.circle() to avoid font-glyph dependency.
 * --------------------------------------------------------------------------
 */

const EPDF_JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const EPDF_KFONT_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf';

const EPDF_BRAND = {
  title: 'Test Prep',
  subtitle: 'Reading Comprehension Practice',
  footerText: 'Test Prep',
  color: [0, 82, 204], // Wanted-Blue-ish accent (no relation to WDS)
  colorSoft: [230, 240, 252],
};

const EPDF_LOCALE = {
  nameLabel: '이름',
  dateLabel: '날짜',
  scoreLabel: '점수',
  mainPassageLabel: '[다음 글을 읽고 물음에 답하시오]',
  answerKeyTitle: '정답 및 해설',
  answerTableLabel: '정답표',
  translationTitle: '국문 해석',
  answerLabel: '정답',
  explanationLabel: '해설',
  saSummaryLabel: '주관식(하단 참고)',
};

// ───── 페이지 기하학 ─────
const EPDF_PAGE = {
  W: 210, H: 297,
  MARGIN: 16,
  HEADER_TITLE_Y: 14,
  HEADER_LINE_Y: 23,
  CONTENT_TOP_FIRST: 50, // 학생정보 바 + 여유 후
  CONTENT_TOP: 32,        // 2페이지 이후 (헤더선 23 + 여백 9)
  CONTENT_BOTTOM: 280,
  FOOTER_LINE_Y: 284,
  FOOTER_TEXT_Y: 289,
  STUDENT_BAR_Y: 28,
  STUDENT_BAR_H: 11,
};

// ───── 동적 로딩 ─────
function epdfLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error('script load failed: ' + src));
    document.head.appendChild(s);
  });
}

async function epdfLoadJsLib() {
  if (!window.jspdf) await epdfLoadScript(EPDF_JSPDF_URL);
  return window.jspdf.jsPDF;
}

async function epdfLoadKoreanFont(pdf) {
  const fontName = 'NanumGothic';
  if (pdf.getFontList()[fontName]) {
    pdf.setFont(fontName, 'normal');
    return;
  }
  const r = await fetch(EPDF_KFONT_URL);
  if (!r.ok) throw new Error('한글 폰트 로딩 실패');
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  pdf.addFileToVFS('NanumGothic-Regular.ttf', btoa(bin));
  pdf.addFont('NanumGothic-Regular.ttf', fontName, 'normal');
  pdf.setFont(fontName, 'normal');
}

// ───── HTML/마커 정규화 ─────
function epdfStripHtml(s) {
  return String(s || '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<\s*p[^>]*>/gi, '')
    .replace(/<\s*u\s*>([\s\S]+?)<\s*\/\s*u\s*>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// answer string → 1~5 인덱스 (객관식 매핑)
function epdfAnswerToIndex(answer) {
  if (!answer) return -1;
  const s = String(answer).trim();
  const circleIdx = ['①', '②', '③', '④', '⑤'].indexOf(s.charAt(0));
  if (circleIdx >= 0) return circleIdx + 1;
  const letterM = s.match(/^\(?([a-eA-E])\)?/);
  if (letterM) return letterM[1].toLowerCase().charCodeAt(0) - 96;
  const numM = s.match(/^([1-5])\b/);
  if (numM) return parseInt(numM[1], 10);
  return -1;
}

// 동그라미 번호 직접 그리기 (폰트 의존성 0%)
function epdfDrawCircleNumber(pdf, n, cx, cy, opts = {}) {
  const r = opts.r || 1.95;
  const fs = opts.fontSize || 7;
  const fillColor = opts.fill || [255, 255, 255];
  const strokeColor = opts.stroke || [70, 70, 80];
  const textColor = opts.color || [35, 35, 40];

  pdf.setDrawColor(...strokeColor);
  pdf.setLineWidth(0.3);
  pdf.setFillColor(...fillColor);
  pdf.circle(cx, cy, r, 'FD');
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(fs);
  pdf.setTextColor(...textColor);
  pdf.text(String(n), cx, cy + 0.95, { align: 'center' });
}

// 텍스트 줄바꿈
function epdfDrawWrapped(pdf, text, x, y, maxW, lineH, opts = {}) {
  const fs = opts.fontSize || 10;
  const color = opts.color || [30, 30, 35];

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(fs);
  pdf.setTextColor(...color);

  const cleanText = epdfStripHtml(text).replace(/\n{3,}/g, '\n\n');
  if (!cleanText.trim()) return y;

  const paragraphs = cleanText.split('\n');
  let cy = y;
  paragraphs.forEach(para => {
    if (!para.trim()) {
      cy += lineH * 0.5;
      return;
    }
    const lines = pdf.splitTextToSize(para, maxW);
    lines.forEach(line => {
      pdf.text(line, x, cy);
      cy += lineH;
    });
  });
  return cy;
}

function epdfMeasureWrapped(pdf, text, maxW, lineH, fontSize = 10) {
  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(fontSize);
  const cleanText = epdfStripHtml(text);
  if (!cleanText.trim()) return 0;
  const paragraphs = cleanText.split('\n');
  let h = 0;
  paragraphs.forEach(para => {
    if (!para.trim()) { h += lineH * 0.5; return; }
    h += pdf.splitTextToSize(para, maxW).length * lineH;
  });
  return h;
}

// ───── 선택지 적응형 레이아웃 ─────
function epdfChoiceLayout(choices) {
  if (!choices || choices.length === 0) return 'stack';
  const cleaned = choices.map(c => epdfStripHtml(String(c || '')).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim());
  const maxLen = Math.max(...cleaned.map(c => c.length));
  // 페이지 폭 178mm 에 5개 가로 배치하려면 셀당 35mm. 9.5pt에서 한글 약 7~8자, 영문 약 14~17자 들어감.
  if (maxLen <= 5) return 'row';
  if (maxLen <= 22) return 'col2';
  return 'stack';
}

function epdfRenderChoices(pdf, choices, x, y, width, opts = {}) {
  if (!choices || choices.length === 0) return y;
  const uniqueChoices = [...new Set(choices)];
  const layout = epdfChoiceLayout(uniqueChoices);
  const fs = 9.5;
  const lineH = 4.6;
  const circleR = 1.9;
  const circleGap = 1.2; // 동그라미 우측 텍스트 시작까지의 갭

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(fs);
  pdf.setTextColor(35, 35, 40);

  let cy = y;

  if (layout === 'row') {
    const cellW = width / uniqueChoices.length;
    uniqueChoices.forEach((choice, i) => {
      const baseX = x + cellW * i;
      const circleCx = baseX + circleR;
      epdfDrawCircleNumber(pdf, i + 1, circleCx, cy - 0.6, { r: circleR });
      const clean = epdfStripHtml(choice).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim();
      pdf.setFont('NanumGothic', 'normal');
      pdf.setFontSize(fs);
      pdf.setTextColor(35, 35, 40);
      pdf.text(clean, circleCx + circleR + circleGap, cy);
    });
    cy += lineH + 1;
  } else if (layout === 'col2') {
    const colW = (width - 4) / 2;
    const rows = Math.ceil(uniqueChoices.length / 2);
    for (let r = 0; r < rows; r++) {
      const iL = r * 2, iR = r * 2 + 1;
      let leftLines = [], rightLines = [];
      const textWidth = colW - (circleR * 2 + circleGap);

      if (iL < uniqueChoices.length) {
        const cx = x + circleR;
        epdfDrawCircleNumber(pdf, iL + 1, cx, cy - 0.6, { r: circleR });
        // 폰트 상태를 NanumGothic으로 복원 후 텍스트 렌더
        pdf.setFont('NanumGothic', 'normal');
        pdf.setFontSize(fs);
        pdf.setTextColor(35, 35, 40);
        const clean = epdfStripHtml(uniqueChoices[iL]).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim();
        leftLines = pdf.splitTextToSize(clean, textWidth);
        const textX = cx + circleR + circleGap;
        leftLines.forEach((line, li) => pdf.text(line, textX, cy + li * lineH));
      }
      if (iR < uniqueChoices.length) {
        const cx = x + colW + 4 + circleR;
        epdfDrawCircleNumber(pdf, iR + 1, cx, cy - 0.6, { r: circleR });
        pdf.setFont('NanumGothic', 'normal');
        pdf.setFontSize(fs);
        pdf.setTextColor(35, 35, 40);
        const clean = epdfStripHtml(uniqueChoices[iR]).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim();
        rightLines = pdf.splitTextToSize(clean, textWidth);
        const textX = cx + circleR + circleGap;
        rightLines.forEach((line, li) => pdf.text(line, textX, cy + li * lineH));
      }
      const rowLines = Math.max(leftLines.length, rightLines.length, 1);
      cy += rowLines * lineH;
    }
    cy += 0.5;
  } else { // stack
    uniqueChoices.forEach((choice, i) => {
      const clean = epdfStripHtml(choice).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim();
      epdfDrawCircleNumber(pdf, i + 1, x + circleR, cy - 0.6, { r: circleR });
      // 폰트 상태 복원
      pdf.setFont('NanumGothic', 'normal');
      pdf.setFontSize(fs);
      pdf.setTextColor(35, 35, 40);
      const textX = x + circleR * 2 + circleGap;
      const lines = pdf.splitTextToSize(clean, width - circleR * 2 - circleGap);
      lines.forEach(line => {
        pdf.text(line, textX, cy);
        cy += lineH;
      });
    });
  }
  return cy;
}

function epdfMeasureChoices(pdf, choices, width) {
  if (!choices || choices.length === 0) return 0;
  const uniqueChoices = [...new Set(choices)];
  const layout = epdfChoiceLayout(uniqueChoices);
  const lineH = 4.6;
  if (layout === 'row') return lineH + 1.2;
  if (layout === 'col2') return Math.ceil(uniqueChoices.length / 2) * lineH + 0.7;
  // stack
  pdf.setFontSize(9.5);
  const circleR = 1.9;
  let h = 0;
  uniqueChoices.forEach(c => {
    const clean = epdfStripHtml(c).replace(/^[①②③④⑤1-5]\.?\s*/, '').trim();
    const lines = pdf.splitTextToSize(clean, width - circleR * 2 - 1.2);
    h += Math.max(1, lines.length) * lineH;
  });
  return h;
}

// ───── 헤더 ─────
function epdfDrawHeader(pdf) {
  const { W, MARGIN, HEADER_TITLE_Y, HEADER_LINE_Y } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;

  // 좌측 brand 바
  pdf.setFillColor(R, G, B);
  pdf.rect(MARGIN, HEADER_TITLE_Y - 5, 3.5, 11, 'F');

  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(R, G, B);
  pdf.text(EPDF_BRAND.title, MARGIN + 6, HEADER_TITLE_Y + 1);

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(7.8);
  pdf.setTextColor(130, 130, 138);
  pdf.text(EPDF_BRAND.subtitle, MARGIN + 6, HEADER_TITLE_Y + 5.6);

  // 헤더 라인 (브랜드 컬러)
  pdf.setDrawColor(R, G, B);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, HEADER_LINE_Y, W - MARGIN, HEADER_LINE_Y);
}

// ───── 학생정보 바 ─────
function epdfDrawStudentBar(pdf) {
  const { MARGIN, W, STUDENT_BAR_Y, STUDENT_BAR_H } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;

  pdf.setFillColor(250, 251, 253);
  pdf.setDrawColor(220, 226, 232);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(MARGIN, STUDENT_BAR_Y, innerW, STUDENT_BAR_H, 1.6, 1.6, 'FD');

  // 좌측 brand 액센트
  pdf.setFillColor(R, G, B);
  pdf.rect(MARGIN, STUDENT_BAR_Y, 1.4, STUDENT_BAR_H, 'F');

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(60, 60, 68);

  const colW = innerW / 3;
  const labels = [
    { label: EPDF_LOCALE.nameLabel, x: MARGIN + 6 },
    { label: EPDF_LOCALE.dateLabel, x: MARGIN + colW + 3 },
    { label: EPDF_LOCALE.scoreLabel, x: MARGIN + colW * 2 + 3 },
  ];

  labels.forEach(({ label, x }, i) => {
    pdf.setTextColor(R, G, B);
    pdf.text(label, x, STUDENT_BAR_Y + 7);
    const labelW = pdf.getTextWidth(label);
    pdf.setDrawColor(160, 168, 180);
    pdf.setLineWidth(0.2);
    const lineEndX = MARGIN + colW * (i + 1) - 5;
    pdf.line(x + labelW + 3, STUDENT_BAR_Y + 7.4, lineEndX, STUDENT_BAR_Y + 7.4);
  });
}

// ───── 푸터 ─────
function epdfDrawFooter(pdf, pageNum, totalPages) {
  const { W, MARGIN, FOOTER_LINE_Y, FOOTER_TEXT_Y } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;

  pdf.setDrawColor(R, G, B);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN, FOOTER_LINE_Y, W - MARGIN, FOOTER_LINE_Y);

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(R, G, B);
  pdf.text(EPDF_BRAND.footerText, MARGIN, FOOTER_TEXT_Y);

  pdf.setTextColor(140, 140, 148);
  pdf.text(new Date().toISOString().slice(0, 10), W / 2, FOOTER_TEXT_Y, { align: 'center' });
  pdf.text(`${pageNum} / ${totalPages}`, W - MARGIN, FOOTER_TEXT_Y, { align: 'right' });
}

// ───── 메인 지문 ─────
function epdfRenderMainPassage(pdf, passage, startY) {
  const { MARGIN, W } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;

  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(R, G, B);
  pdf.text(EPDF_LOCALE.mainPassageLabel, MARGIN, startY);

  let cy = startY + 6;
  cy = epdfDrawWrapped(pdf, passage, MARGIN, cy, innerW, 5, {
    fontSize: 10.5,
    color: [40, 40, 48],
  });

  cy += 3;
  pdf.setDrawColor(R, G, B);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, cy, W - MARGIN, cy);
  return cy + 5;
}

// ───── 문항 한 개 ─────
function epdfRenderQuestion(pdf, qNum, qData, startY) {
  const { MARGIN, W } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;
  const INDENT = 7;
  const innerWIndented = innerW - INDENT;

  let cy = startY;
  const FS = 10;
  const LH = 5;

  // 번호 (브랜드 컬러)
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(R, G, B);
  pdf.text(`${qNum}.`, MARGIN, cy);

  // 질문 텍스트
  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(FS);
  pdf.setTextColor(20, 20, 28);
  const questionText = epdfStripHtml(qData.question || '').trim();
  const qParagraphs = questionText.split('\n');
  qParagraphs.forEach(para => {
    if (!para.trim()) { cy += LH * 0.5; return; }
    const lines = pdf.splitTextToSize(para, innerWIndented);
    lines.forEach(line => {
      pdf.text(line, MARGIN + INDENT, cy);
      cy += LH;
    });
  });

  // 개별 지문
  if (qData.passage) {
    cy += 1.5;
    cy = epdfDrawWrapped(pdf, qData.passage, MARGIN + INDENT, cy, innerWIndented, 4.6, {
      fontSize: 9.5,
      color: [55, 55, 65],
    });
  }

  // 선택지
  if (Array.isArray(qData.choices) && qData.choices.length > 0) {
    cy += 2;
    cy = epdfRenderChoices(pdf, qData.choices, MARGIN + INDENT, cy, innerWIndented);
  } else {
    cy += 2;
    pdf.setDrawColor(155, 160, 170);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([0.6, 0.8], 0);
    pdf.line(MARGIN + INDENT, cy + 4, W - MARGIN - 4, cy + 4);
    pdf.setLineDashPattern([], 0);
    cy += 8;
  }

  return cy + 4; // 문항 간격
}

function epdfMeasureQuestion(pdf, qData) {
  const { MARGIN, W } = EPDF_PAGE;
  const INDENT = 7;
  const innerW = W - MARGIN * 2 - INDENT;

  let h = 0;
  const qText = epdfStripHtml(qData.question || '').trim();
  h += epdfMeasureWrapped(pdf, qText, innerW, 5, 10);

  if (qData.passage) {
    h += 1.5;
    h += epdfMeasureWrapped(pdf, qData.passage, innerW, 4.6, 9.5);
  }

  if (Array.isArray(qData.choices) && qData.choices.length) {
    h += 2;
    h += epdfMeasureChoices(pdf, qData.choices, innerW);
  } else {
    h += 10;
  }

  return h + 4;
}

// ───── 정답표 박스 (정답 페이지 상단) ─────
function epdfRenderAnswerTable(pdf, entries, startY) {
  const { MARGIN, W } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;

  let cy = startY;

  // 헤더 스트립
  pdf.setFillColor(R, G, B);
  pdf.rect(MARGIN, cy, innerW, 7.5, 'F');
  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text(EPDF_LOCALE.answerTableLabel, MARGIN + 4, cy + 5.2);
  cy += 7.5;

  // 본문
  const colsPerRow = 5;
  const cellW = innerW / colsPerRow;
  const cellH = 9;
  const rows = Math.ceil(entries.length / colsPerRow);
  const totalH = rows * cellH;

  pdf.setFillColor(252, 253, 255);
  pdf.setDrawColor(220, 228, 240);
  pdf.setLineWidth(0.2);
  pdf.rect(MARGIN, cy, innerW, totalH, 'FD');

  // 그리드
  for (let c = 1; c < colsPerRow; c++) {
    pdf.line(MARGIN + cellW * c, cy, MARGIN + cellW * c, cy + totalH);
  }
  for (let r = 1; r < rows; r++) {
    pdf.line(MARGIN, cy + cellH * r, MARGIN + innerW, cy + cellH * r);
  }

  // 엔트리 그리기
  entries.forEach((entry, i) => {
    const r = Math.floor(i / colsPerRow);
    const c = i % colsPerRow;
    const cellX = MARGIN + cellW * c;
    const midY = cy + cellH * r + cellH / 2;

    // 번호
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(R, G, B);
    pdf.text(`${entry.num}.`, cellX + 3, midY + 1.2);

    if (!entry.isObjective) {
      pdf.setFont('NanumGothic', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(110, 115, 125);
      pdf.text(EPDF_LOCALE.saSummaryLabel, cellX + 9, midY + 1.2);
    } else {
      const idx = epdfAnswerToIndex(entry.answer);
      if (idx > 0 && idx <= 5) {
        epdfDrawCircleNumber(pdf, idx, cellX + 13, midY, {
          r: 2.1,
          fill: EPDF_BRAND.colorSoft,
          stroke: EPDF_BRAND.color,
          color: EPDF_BRAND.color,
          fontSize: 7.5,
        });
      } else {
        pdf.setFont('NanumGothic', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(30, 30, 35);
        pdf.text(String(entry.answer || '-').slice(0, 14), cellX + 9, midY + 1.2);
      }
    }
  });

  return cy + totalH + 7;
}

// ───── 정답 + 해설 상세 ─────
function epdfRenderAnswerDetails(pdf, activities, entries, startY) {
  const { MARGIN, W, CONTENT_BOTTOM, CONTENT_TOP } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;

  let cy = startY;
  let entryIdx = 0;

  activities.forEach(act => {
    if (!Array.isArray(act.questions)) return;

    act.questions.forEach(q => {
      const entry = entries[entryIdx++];
      const answer = epdfStripHtml(String(q.answer || '')).trim();
      const explanation = epdfStripHtml(String(q.explanation || '')).trim();
      const idx = entry && entry.isObjective ? epdfAnswerToIndex(answer) : -1;

      // 사전 측정
      pdf.setFontSize(9);
      const explH = explanation
        ? pdf.splitTextToSize(`${EPDF_LOCALE.explanationLabel}: ${explanation}`, innerW - 8).length * 4.4
        : 0;
      const blockH = 5 + explH + 2.5;

      if (cy + blockH > CONTENT_BOTTOM) {
        pdf.addPage();
        epdfDrawHeader(pdf);
        cy = CONTENT_TOP;
      }

      // 번호
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(R, G, B);
      pdf.text(`${entry.num}.`, MARGIN, cy);
      const numW = pdf.getTextWidth(`${entry.num}.`);

      // 활동 타입 (인라인)
      pdf.setFont('NanumGothic', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(85, 90, 100);
      const typeText = `[${act.type}]`;
      const typeX = MARGIN + numW + 1.5;
      pdf.text(typeText, typeX, cy);
      const typeW = pdf.getTextWidth(typeText);

      // 정답 라벨
      pdf.setTextColor(60, 65, 75);
      const labelX = typeX + typeW + 3;
      pdf.text(EPDF_LOCALE.answerLabel, labelX, cy);
      const labelW = pdf.getTextWidth(EPDF_LOCALE.answerLabel);

      // 정답 값
      const valueX = labelX + labelW + 3;
      if (entry && entry.isObjective && idx > 0 && idx <= 5) {
        epdfDrawCircleNumber(pdf, idx, valueX + 1.95, cy - 0.7, {
          r: 1.95,
          fill: EPDF_BRAND.colorSoft,
          stroke: EPDF_BRAND.color,
          color: EPDF_BRAND.color,
          fontSize: 7,
        });
      } else {
        pdf.setFont('NanumGothic', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 30, 35);
        pdf.text(answer || '-', valueX, cy);
      }
      cy += 5;

      // 해설
      if (explanation) {
        pdf.setFont('NanumGothic', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(95, 100, 110);
        const explLines = pdf.splitTextToSize(`${EPDF_LOCALE.explanationLabel}: ${explanation}`, innerW - 8);
        explLines.forEach(line => {
          if (cy > CONTENT_BOTTOM) {
            pdf.addPage();
            epdfDrawHeader(pdf);
            cy = CONTENT_TOP;
          }
          pdf.text(line, MARGIN + 8, cy);
          cy += 4.4;
        });
      }
      cy += 2.5;
    });
  });

  return cy;
}

// ───── 국문 해석 ─────
function epdfRenderTranslation(pdf, translation, startY) {
  const { MARGIN, W } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;
  const innerW = W - MARGIN * 2;

  let cy = startY;

  // 타이틀 + brand 막대
  pdf.setFillColor(R, G, B);
  pdf.rect(MARGIN, cy - 4.5, 3, 7, 'F');
  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(13);
  pdf.setTextColor(R, G, B);
  pdf.text(EPDF_LOCALE.translationTitle, MARGIN + 5, cy);
  cy += 8;

  return epdfDrawWrapped(pdf, translation, MARGIN, cy, innerW, 5.2, {
    fontSize: 10.5,
    color: [45, 45, 52],
  });
}

// ───── 정답 페이지 타이틀 ─────
function epdfRenderAnswerKeyTitle(pdf, y) {
  const { MARGIN } = EPDF_PAGE;
  const [R, G, B] = EPDF_BRAND.color;

  pdf.setFillColor(R, G, B);
  pdf.rect(MARGIN, y - 4.5, 3, 7, 'F');
  pdf.setFont('NanumGothic', 'normal');
  pdf.setFontSize(13);
  pdf.setTextColor(R, G, B);
  pdf.text(EPDF_LOCALE.answerKeyTitle, MARGIN + 5, y);
  return y + 7;
}

// ───── 메인 엔트리 ─────
async function generateExamPdf({ activityData, showingAnswers, showingTranslation }) {
  if (!activityData || activityData.mode !== 'exam') {
    throw new Error('generateExamPdf는 exam 모드 데이터에만 사용 가능합니다.');
  }

  const JsPDF = await epdfLoadJsLib();
  const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
  await epdfLoadKoreanFont(pdf);

  // === Page 1: 헤더 + 학생바 + 메인 지문 + 문항들 ===
  epdfDrawHeader(pdf);
  epdfDrawStudentBar(pdf);
  let cy = EPDF_PAGE.CONTENT_TOP_FIRST;

  if (activityData.originalPassage) {
    cy = epdfRenderMainPassage(pdf, activityData.originalPassage, cy);
  }

  // 모든 문항 평탄화 (번호/객관식 여부 미리 산출)
  const validActivities = Array.isArray(activityData.activities) ? activityData.activities : [];
  const entries = [];
  let nn = 1;
  validActivities.forEach(act => {
    if (!Array.isArray(act.questions)) return;
    act.questions.forEach(q => {
      entries.push({
        num: nn++,
        answer: q.answer || '',
        isObjective: Array.isArray(q.choices) && q.choices.length > 0,
      });
    });
  });

  let qIdx = 0;
  validActivities.forEach(act => {
    if (!Array.isArray(act.questions)) return;
    act.questions.forEach(q => {
      const needH = epdfMeasureQuestion(pdf, q);
      if (cy + needH > EPDF_PAGE.CONTENT_BOTTOM) {
        pdf.addPage();
        epdfDrawHeader(pdf);
        cy = EPDF_PAGE.CONTENT_TOP;
      }
      cy = epdfRenderQuestion(pdf, entries[qIdx].num, q, cy);
      qIdx++;
    });
  });

  // === 정답 페이지 ===
  if (showingAnswers && entries.length > 0) {
    pdf.addPage();
    epdfDrawHeader(pdf);
    cy = EPDF_PAGE.CONTENT_TOP;
    cy = epdfRenderAnswerKeyTitle(pdf, cy);
    cy = epdfRenderAnswerTable(pdf, entries, cy);
    cy = epdfRenderAnswerDetails(pdf, validActivities, entries, cy);
  }

  // === 국문 해석 페이지 ===
  if (showingTranslation && activityData.translation) {
    pdf.addPage();
    epdfDrawHeader(pdf);
    cy = EPDF_PAGE.CONTENT_TOP;
    cy = epdfRenderTranslation(pdf, activityData.translation, cy);
  }

  // === 푸터 일괄 ===
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    epdfDrawFooter(pdf, p, totalPages);
  }

  const today = new Date().toISOString().slice(0, 10);
  pdf.save(`Test Prep_${today}.pdf`);
}

window.generateExamPdf = generateExamPdf;
