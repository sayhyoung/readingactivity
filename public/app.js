let activityData = null;
let showingAnswers = false;
let showingTranslation = false;
let selectedMode = null;

function showSection(sectionId) {
  const sections = ["upload", "modeSelect", "activity", "activityCheck"];
  sections.forEach(id => {
    const sec = document.getElementById(id);
    if (sec) sec.style.display = (id === sectionId) ? "block" : "none";
  });
}

function selectMode(mode) {
  selectedMode = mode;
  
  const activityTitle = document.getElementById('activityTitle');
  const activityContent = document.getElementById('activityContent');
  const generateBtnText = document.getElementById('generateBtnText');
  const loadingText = document.getElementById('loadingText');
  
  if (mode === 'worksheet') {
    activityTitle.innerHTML = '<i class="fas fa-pen-fancy"></i> 워크시트 활동 생성';
    generateBtnText.textContent = '워크시트 생성 시작';
    loadingText.textContent = '워크시트를 생성하는 중입니다. 잠시만 기다려주세요...';
    activityContent.innerHTML = getWorksheetOptions();
  } else if (mode === 'exam') {
    activityTitle.innerHTML = '<i class="fas fa-file-alt"></i> 시험 대비 문항 생성';
    generateBtnText.textContent = '문항 생성 시작';
    loadingText.textContent = '문항을 생성하는 중입니다. 잠시만 기다려주세요...';
    activityContent.innerHTML = getExamOptions();
  }
  
  showSection('activity');
}

function getWorksheetOptions() {
  return `
    <p style="margin-bottom: 20px;">👉🏻 생성할 활동 유형을 선택하고 각 활동의 문항 수를 설정하세요:</p>
    
    <div class="activity-row">
      <label>
        <input type="checkbox" class="activity-type" value="단어 및 주요 표현 익히기" onchange="toggleActivityConfig(this)"> 
        단어 및 주요 표현 익히기 (단어 50% + 숙어 50%)
      </label>
      <div class="config-group">
        <span>문항 수:</span>
        <input type="number" class="count-input" value="10" min="2" max="20" step="2">
        <span style="font-size: 12px; color: #666;">(짝수 권장)</span>
      </div>
    </div>

    <div class="activity-row">
      <label>
        <input type="checkbox" class="activity-type" value="영어 문장 해석하기" onchange="toggleActivityConfig(this)"> 
        영어 문장 해석하기
      </label>
      <div class="config-group">
        <span>문항 수:</span>
        <input type="number" class="count-input" value="5" min="1" max="20">
      </div>
    </div>

    <div class="activity-row">
      <label>
        <input type="checkbox" class="activity-type" value="빈 칸 채우기" onchange="toggleActivityConfig(this)"> 
        빈 칸 채우기
      </label>
      <div class="config-group">
        <span>문항 수:</span>
        <input type="number" class="count-input" value="5" min="1" max="20">
        <span>빈칸 수:</span>
        <select class="blanks-select">
          <option value="single">1개</option>
          <option value="multiple">2개 이상</option>
        </select>
        <label style="margin-left: 10px;">
          <input type="checkbox" class="show-korean-translation" checked> 해석 포함
        </label>
      </div>
    </div>

    <div class="activity-row">
      <label>
        <input type="checkbox" class="activity-type" value="문장 재배열 활동" onchange="toggleActivityConfig(this)"> 
        문장 재배열 활동 (첫 단어 자동 표시)
      </label>
      <div class="config-group">
        <span>문항 수:</span>
        <input type="number" class="count-input" value="5" min="1" max="20">
        <label style="margin-left: 10px;">
          <input type="checkbox" class="show-korean-translation"> 해석 포함
        </label>
      </div>
    </div>

    <div class="activity-row">
      <label>
        <input type="checkbox" class="activity-type" value="우리말 영어로 번역하기" onchange="toggleActivityConfig(this)"> 
        우리말 영어로 번역하기
      </label>
      <div class="config-group">
        <span>문항 수:</span>
        <input type="number" class="count-input" value="5" min="1" max="20">
      </div>
    </div>
  `;
}

function getExamOptions() {
  const allTypes = [
    { value: "주제 및 목적 파악", label: "주제 및 목적 파악 (글의 주제, 제목, 목적 등)" },
    { value: "본문 내용 이해", label: "본문 내용 이해 (내용 일치/불일치 찾기)" },
    { value: "어법 문제", label: "어법 문제 (밑줄 친 부분 중 틀린 것 찾기)" },
    { value: "어휘 문제", label: "어휘 문제 (문맥에 맞는/틀린 낱말 찾기)" },
    { value: "빈칸 완성", label: "빈칸 완성 (문맥에 맞는 단어/구 선택)" },
    { value: "문장 순서 배열", label: "문장 순서 배열" },
    { value: "문장 삽입 위치", label: "문장 삽입 위치 찾기" },
    { value: "주관식 영작", label: "주관식 영작" },
    { value: "주관식 요약문 완성", label: "주관식 요약문 완성" }
  ];
  
  let html = `
    <div style="margin-bottom: 20px;">
      <p style="margin-bottom: 10px;">👉🏻 생성할 문항 유형을 선택하세요 (각 유형당 1문항 자동 생성):</p>
      <div style="display: flex; gap: 10px; margin-bottom: 15px;">
        <button type="button" onclick="selectAllExamTypes()" style="background-color: #ff9800; margin-top: 0;">
          <i class="fas fa-check-double"></i> Select All
        </button>
      </div>
    </div>
  `;
  
  allTypes.forEach(type => {
    html += `
      <div class="activity-row">
        <label>
          <input type="checkbox" class="activity-type exam-type-checkbox" value="${type.value}"> 
          ${type.label}
        </label>
      </div>
    `;
  });
  
  return html;
}

function selectAllExamTypes() {
  const checkboxes = document.querySelectorAll('.exam-type-checkbox');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });
}

function resetUpload() {
  if (confirm('입력된 내용을 모두 초기화하시겠습니까?')) {
    document.getElementById('passage').value = '';
    const cameraInput = document.getElementById('cameraInput');
    const fileInput = document.getElementById('fileInput');
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
    activityData = null;
    showingAnswers = false;
    showingTranslation = false;
    selectedMode = null;
    showSection('upload');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFileChange(inputElement) {
  const imageInput = inputElement;
  const passageTextarea = document.getElementById('passage');
  
  if (imageInput.files && imageInput.files[0]) {
    const file = imageInput.files[0];
    
    if (file.size > 10 * 1024 * 1024) {
      alert('이미지 파일 크기가 너무 큽니다. 10MB 이하의 파일을 선택해주세요.');
      imageInput.value = '';
      return;
    }
    
    passageTextarea.value = '🤖 AI 기반 고성능 OCR로 텍스트를 추출하고 있습니다...\n잠시만 기다려주세요.';
    
    try {
      const base64Data = await fileToBase64(file);
      
      const resp = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: base64Data }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const extractedText = data.text || '';
        
        if (extractedText.trim()) {
          passageTextarea.value = extractedText;
          alert(`✅ AI OCR 성공!`);
          return;
        }
      }
      
      console.warn('Gemini OCR 실패, Tesseract.js로 폴백');
      const { data: { text } } = await Tesseract.recognize(
        file, 'eng',
        { logger: m => console.log('Tesseract:', m) }
      );
      
      if (text.trim()) {
        passageTextarea.value = text;
        alert(`✅ Tesseract OCR 성공!`);
      } else {
        throw new Error('텍스트 추출 실패');
      }
      
    } catch (error) {
      console.error("OCR Error:", error);
      passageTextarea.value = '';
      alert(`❌ 텍스트 추출 실패: ${error.message}`);
    }
  }
}

function toggleActivityConfig(checkbox) {
  const row = checkbox.closest('.activity-row');
  const configGroup = row.querySelector('.config-group');
  if (checkbox.checked) {
    configGroup.classList.add('active');
  } else {
    configGroup.classList.remove('active');
  }
}

async function generateActivity() {
  const passage = document.getElementById("passage").value.trim();
  if (!passage) {
    alert("지문을 먼저 업로드하거나 입력하세요!");
    return;
  }
  
  if (!selectedMode) {
    alert("모드를 먼저 선택해주세요!");
    showSection('modeSelect');
    return;
  }
  
  const selectedActivities = [];
  const activityConfigs = {};

  document.querySelectorAll('.activity-type:checked').forEach(checkbox => {
    const activityType = checkbox.value;
    const row = checkbox.closest('.activity-row');
    
    const config = { count: 1 };
    
    if (selectedMode === 'worksheet') {
      const countInput = row.querySelector('.count-input');
      if (countInput) config.count = Math.max(1, parseInt(countInput.value) || 1);
      
      const showKoreanCheckbox = row.querySelector('.show-korean-translation');
      if (showKoreanCheckbox) config.showKoreanTranslation = showKoreanCheckbox.checked;
      
      const blanksSelect = row.querySelector('.blanks-select');
      if (blanksSelect) config.blankMode = blanksSelect.value;
    }
    
    selectedActivities.push(activityType);
    activityConfigs[activityType] = config;
  });

  if (!selectedActivities.length) {
    alert("최소 한 개 이상의 활동/문항을 선택해주세요.");
    return;
  }

  document.getElementById("activity-loading-indicator").style.display = "block";

  try {
    const endpoint = selectedMode === 'worksheet' ? '/api/activity' : '/api/exam';
    
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passage,
        activities: selectedActivities,
        activityConfigs: activityConfigs
      }),
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      throw new Error(data.error || `API 오류: ${resp.status}`);
    }

    activityData = data.result;
    activityData.mode = selectedMode;
    activityData.originalPassage = passage;
    showingAnswers = false;
    showingTranslation = false;
    document.getElementById("activity-loading-indicator").style.display = "none";
    
    showSection('activityCheck');
    renderActivity();
  } catch (err) {
    console.error("활동 생성 에러:", err);
    alert("활동 생성에 실패했습니다: " + err.message);
    document.getElementById("activity-loading-indicator").style.display = "none";
  }
}

function toggleAnswers() {
  showingAnswers = !showingAnswers;
  renderActivity();
}

function toggleTranslation() {
  showingTranslation = !showingTranslation;
  renderActivity();
}

function renderActivity() {
  if (!activityData) {
    document.getElementById("activityOutputView").innerHTML = "<p>생성된 활동이 없습니다.</p>";
    return;
  }
  
  const outputDiv = document.getElementById("activityOutputView");
  const mode = activityData.mode || 'worksheet';
  
  let html = `<h3>⬛ ${mode === 'worksheet' ? 'Activities' : 'Exam Questions'}</h3>`;
  const answersByType = {};
  const validActivities = activityData.activities;

  if (validActivities.length === 0) {
    outputDiv.innerHTML = "<h3>⬛ 결과</h3><p>생성된 활동이 없습니다.</p>";
    return;
  }

  if (mode === 'worksheet') {
    validActivities.forEach((act, idx) => {
      if (idx > 0) html += `<div style="margin: 2rem 0;"></div>`;
      html += `<h4>${idx + 1}. ${act.type}</h4><hr class="responsive-line">`;
      html += renderWorksheetActivity(act, answersByType);
    });
  } else {
    // 시험 모드일 때
    let globalQuestionNumber = 1;
    
    // 1. 공통 지문 보여주기 (문항별 개별 지문이 없는 경우를 위한 fallback)
    let displayMainPassage = activityData.originalPassage.replace(/\n/g, '<br>');
    html += `<div class="exam-main-passage">[다음 글을 읽고 물음에 답하시오]<br><br>${displayMainPassage}</div>`;
    html += `<hr class="responsive-line" style="margin: 20px 0;">`;
    
    validActivities.forEach(act => {
      const result = renderExamActivity(act, answersByType, globalQuestionNumber);
      html += result.html;
      globalQuestionNumber = result.nextNumber;
    });
  }

  // 하단 버튼 영역
  html += `
    <div class="copyright-notice" style="margin-top:30px; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px;">
      <p style="margin: 0; font-size: 14px; color: #856404;">
        <i class="fas fa-exclamation-triangle"></i> <strong>저작권 유의사항:</strong> 교과서나 타 출판사 지문을 활용하여 생성한 산출물을 무단 배포할 경우 문제가 될 수 있으니 주의해주세요.
      </p>
    </div>
    <div style="margin-top:20px;">
      <button onclick="toggleAnswers()" style="margin-right: 10px;">
        <i class="fas fa-${showingAnswers ? 'eye-slash' : 'eye'}"></i> 
        ${showingAnswers ? '정답 숨기기' : '정답 보기'}
      </button>
      ${mode === 'exam' ? `
      <button onclick="toggleTranslation()" style="margin-right: 10px;">
        <i class="fas fa-language"></i> 
        ${showingTranslation ? '해석 숨기기' : '해석 보기'}
      </button>` : ''}
      <button onclick="window.print()">
        <i class="fas fa-print"></i> 인쇄하기
      </button>
    </div>
  `;

  if (mode === 'exam' && showingTranslation && activityData.translation) {
    html += `<div class="translation-section"><h3>국문 해석</h3><div class="translation-content">${activityData.translation}</div></div>`;
  }

  if (showingAnswers) {
    html += `<div class="answer-section"><h3>정답 및 해설</h3>`;
    Object.keys(answersByType).forEach(type => {
      html += `<h4>${type}</h4>`;
      answersByType[type].forEach(ans => html += `<div class="answer-item">${ans}</div>`);
    });
    html += `</div>`;
  }

  outputDiv.innerHTML = html;
}

function renderWorksheetActivity(act, answersByType) {
  const config = (activityData.activityConfigs && activityData.activityConfigs[act.type]) || {};
  let html = '';
  
  if (!answersByType[act.type]) answersByType[act.type] = [];

  // 1. 단어 및 주요 표현 익히기
  if (act.type === "단어 및 주요 표현 익히기" && act.items) {
    act.items.forEach((item, i) => {
      html += `<div class="vocab-item"><p>${i+1}) <strong>${item.vocab}</strong>: ${item.meaning}</p><div class="answer-underline"></div></div>`;
    });
  
  // 2. 영어 문장 해석하기
  } else if (act.type === "영어 문장 해석하기" && act.sentences) {
    act.sentences.forEach((s, i) => {
      html += `<div class="translation-item"><p>${i+1}) ${s.original}</p><div class="answer-underline"></div></div>`;
      if (s.answer) answersByType[act.type].push(`${i+1}) ${s.answer}`);
    });

  // 3. 빈 칸 채우기
  } else if (act.type === "빈 칸 채우기" && act.questions) {
    act.questions.forEach((qItem, i) => {
      html += `
        <div class="gap-fill-item">
          <div class="gap-fill-sentence"><strong>${i+1})</strong> ${qItem.sentence}</div>
          ${config.showKoreanTranslation && qItem.korean ? `<div class="gap-fill-translation">(${qItem.korean})</div>` : ''}
        </div>`;
      if (qItem.solution) answersByType[act.type].push(`${i+1}) ${qItem.solution}`);
    });

  // 4. [수정됨] 문장 재배열 활동 (첫 단어 + 밑줄 추가)
  } else if (act.type === "문장 재배열 활동" && act.examples) {
    act.examples.forEach((ex, i) => {
      html += `
      <div class="unscramble-item">
        <div class="unscramble-question">${i+1}) 다음 단어들을 바르게 배열하여 문장을 완성하시오.</div>
        
        ${config.showKoreanTranslation && ex.korean ? `<div class="unscramble-translation">(${ex.korean})</div>` : ''}
        
        <div class="unscramble-fill-area">
          <span class="unscramble-first-word">${ex.firstWord || 'Start'}</span>
          <div class="answer-line-fill"></div>
        </div>

        <div class="shuffled-words">
          <span>${ex.shuffled}</span>
        </div>
      </div>`;
      
      if (ex.answer) answersByType[act.type].push(`${i+1}) ${ex.answer}`);
    });

  // 5. 우리말 영어로 번역하기
  } else if (act.type === "우리말 영어로 번역하기" && act.list) {
    act.list.forEach((row, i) => {
      html += `<div class="translation-item"><p>${i+1}) ${row.korean}</p><div class="answer-underline"></div></div>`;
      if (row.answer) answersByType[act.type].push(`${i+1}) ${row.answer}`);
    });
  }
  
  return html;
}

function renderExamActivity(act, answersByType, startNumber) {
  if (!answersByType[act.type]) answersByType[act.type] = [];
  let html = '';
  let currentNumber = startNumber;
  
  if (act.questions) {
    act.questions.forEach((q, qIndex) => {
      // 1. 문제 텍스트
      html += `
        <div class="exam-question" data-type="${act.type}" data-question-index="${qIndex}">
          <p class="question-text"><strong>${currentNumber}.</strong> ${q.question.replace(/\n/g, '<br>')}</p>
      `;
      
      // 2. [핵심 수정] 문항별 개별 지문(Passage)이 있으면 여기에 렌더링
      // 어법/삽입/어휘 문제는 이곳에 마킹된 지문이 들어옵니다.
      if (q.passage) {
        let displayPassage = q.passage
          .replace(/\n/g, '<br>')
          .replace(/<br><br>/g, '<br>') // 과도한 줄바꿈 방지
          .replace(/\(a\)/gi, '<span class="target-marker">(a)</span>')
          .replace(/\(b\)/gi, '<span class="target-marker">(b)</span>')
          .replace(/\(c\)/gi, '<span class="target-marker">(c)</span>')
          .replace(/\(d\)/gi, '<span class="target-marker">(d)</span>')
          .replace(/\(e\)/gi, '<span class="target-marker">(e)</span>');
          
        html += `<div class="exam-passage">${displayPassage}</div>`;
      }
      
      // 3. 선택지 렌더링 (중복 제거 로직 추가)
      if (q.choices && q.choices.length > 0) {
        // AI가 중복 선택지를 주는 경우를 대비해 Set으로 중복 제거
        const uniqueChoices = [...new Set(q.choices)];
        
        html += `<div class="choices">`;
        uniqueChoices.forEach((choice, idx) => {
          const choiceNumber = ['①', '②', '③', '④', '⑤'][idx] || `${idx + 1}.`;
          let cleanedChoice = choice.trim();
          
          // 선택지 앞의 불필요한 번호 제거 (예: "1. Apple" -> "Apple")
          cleanedChoice = cleanedChoice.replace(/^[①②③④⑤1-5]\.?\s*/, '');
          
          html += `<div class="choice-item">${choiceNumber} ${cleanedChoice}</div>`;
        });
        html += `</div>`;
      }
      
      html += `</div>`; // exam-question close
      
      // 정답 데이터 저장
      if (q.answer) {
        let answerText = `${currentNumber}) ${q.answer}`;
        if (q.explanation) answerText += `<br><span style="color: #666;">해설: ${q.explanation}</span>`;
        answersByType[act.type].push(answerText);
      }
      
      currentNumber++;
    });
  }
  
  return { html, nextNumber: currentNumber };
}

window.onload = () => { showSection('upload'); };