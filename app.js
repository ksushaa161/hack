(function () {
  "use strict";

  /**
   * URL обработчика (webhook, тестовый API): задайте window.QUIZ_SUBMIT_URL до подключения app.js.
   * Если не задан — демо: данные в консоль и имитация успешной отправки (по ТЗ допустимо).
   */
  var SUBMIT_URL =
    typeof window !== "undefined" && window.QUIZ_SUBMIT_URL != null && String(window.QUIZ_SUBMIT_URL).length > 0
      ? String(window.QUIZ_SUBMIT_URL)
      : "";

  var TOTAL_STEPS = 6;
  var AUTO_ADVANCE_MS = 320;

  var state = {
    room_type: "",
    zones: [],
    area: 60,
    style: "",
    budget: "",
    name: "",
    phone: "",
    email: "",
    comment: "",
  };

  var currentStep = 0;
  var submitLocked = false;

  var progressBar = document.getElementById("progress-bar");
  var stepLabel = document.getElementById("step-label-text");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".quiz-step[data-step]")).filter(function (el) {
    return el.getAttribute("data-step") !== "success";
  });
  var successScreen = document.getElementById("success-screen");
  var quizNav = document.getElementById("quiz-nav");
  var btnBack = document.getElementById("btn-back");
  var btnNext = document.getElementById("btn-next");
  var btnRestart = document.getElementById("btn-restart");
  var areaSlider = document.getElementById("area-slider");
  var areaDisplay = document.getElementById("area-display");
  var zonesError = document.getElementById("zones-error");
  var contactForm = document.getElementById("contact-form");
  var phoneError = document.getElementById("phone-error");
  var emailError = document.getElementById("email-error") || null;
  var consentError = document.getElementById("consent-error");
  var formGlobalError = document.getElementById("form-global-error");
  var btnSubmit = document.getElementById("btn-submit");

  function trackEvent(name, detail) {
    detail = detail || {};
    try {
      window.dispatchEvent(new CustomEvent("quiz_analytics", { detail: { event: name, ...detail } }));
    } catch (e) {
      /* ignore */
    }
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[analytics]", name, detail);
    }
  }

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var out = {};
    keys.forEach(function (k) {
      var v = params.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  function buildPayload() {
    var utm = getUtmParams();
    return {
      room_type: state.room_type,
      zones: state.zones.slice(),
      area: state.area,
      style: state.style,
      budget: state.budget,
      name: state.name.trim(),
      phone: state.phone.trim(),
      email: state.email.trim(),
      comment: state.comment.trim(),
      submitted_at: new Date().toISOString(),
      page_url: window.location.href.split("#")[0],
      ...utm,
    };
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidPhone(value) {
    var d = normalizePhoneDigits(value);
    if (d.length === 10) return true;
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) return true;
    return false;
  }

  function isValidEmailOptional(value) {
    var s = String(value || "").trim();
    if (!s) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function setProgress() {
    var pct = ((currentStep + 1) / TOTAL_STEPS) * 100;
    progressBar.style.width = pct + "%";
    stepLabel.textContent = "Шаг " + (currentStep + 1) + " из " + TOTAL_STEPS;
  }

  function updateNextEnabled() {
    if (currentStep === TOTAL_STEPS - 1) return;
    var ok = true;
    if (currentStep === 0) ok = !!state.room_type;
    else if (currentStep === 1) {
      syncZonesFromDom();
      ok = state.zones.length > 0;
    } else if (currentStep === 3) ok = !!state.style;
    else if (currentStep === 4) ok = !!state.budget;
    btnNext.disabled = !ok;
  }

  function showStep(index) {
    steps.forEach(function (el, i) {
      el.classList.toggle("is-active", i === index);
      el.hidden = i !== index;
    });
    successScreen.hidden = true;
    successScreen.classList.remove("is-active");
    quizNav.classList.remove("is-hidden");
    setProgress();
    btnBack.disabled = index === 0;
    btnNext.style.display = index === TOTAL_STEPS - 1 ? "none" : "";
    updateNextEnabled();
    if (index === TOTAL_STEPS - 1) {
      trackEvent("quiz_form_view");
    }
  }

  function goToStep(index) {
    if (index < 0 || index >= TOTAL_STEPS) return;
    currentStep = index;
    showStep(currentStep);
    trackEvent("quiz_step_" + (currentStep + 1));
  }

  function validateCurrentStep() {
    zonesError.hidden = true;
    if (currentStep === 0) {
      if (!state.room_type) return false;
      return true;
    }
    if (currentStep === 1) {
      syncZonesFromDom();
      if (state.zones.length === 0) {
        zonesError.hidden = false;
        return false;
      }
      return true;
    }
    if (currentStep === 2) return true;
    if (currentStep === 3) {
      if (!state.style) return false;
      return true;
    }
    if (currentStep === 4) {
      if (!state.budget) return false;
      return true;
    }
    return true;
  }

  function syncZonesFromDom() {
    var boxes = document.querySelectorAll('#zones-grid input[type="checkbox"]');
    state.zones = [];
    boxes.forEach(function (cb) {
      if (cb.checked) state.zones.push(cb.value);
    });
  }

  function applyZonesToDom() {
    var boxes = document.querySelectorAll('#zones-grid input[type="checkbox"]');
    boxes.forEach(function (cb) {
      cb.checked = state.zones.indexOf(cb.value) !== -1;
    });
  }

  function setSingleSelected(container, value) {
    var buttons = container.querySelectorAll(".option-card[data-value]");
    buttons.forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.getAttribute("data-value") === value);
    });
  }

  function syncUIFromState() {
    var step0 = steps[0];
    setSingleSelected(step0, state.room_type);

    applyZonesToDom();

    areaSlider.value = String(state.area);
    areaSlider.setAttribute("aria-valuenow", String(state.area));
    areaDisplay.textContent = "Площадь: " + state.area + " м²";

    setSingleSelected(steps[3], state.style);
    setSingleSelected(steps[4], state.budget);

    document.getElementById("f-name").value = state.name;
    document.getElementById("f-phone").value = state.phone;
    document.getElementById("f-email").value = state.email;
    document.getElementById("f-comment").value = state.comment;
  }

  function bindSingleChoice(stepIndex, field) {
    var step = steps[stepIndex];
    step.addEventListener("click", function (e) {
      var btn = e.target.closest(".option-card[data-value]");
      if (!btn || stepIndex === 1) return;
      var val = btn.getAttribute("data-value");
      state[field] = val;
      setSingleSelected(step, val);
      var auto = stepIndex === 0 || stepIndex === 3 || stepIndex === 4;
      updateNextEnabled();
      if (auto) {
        window.setTimeout(function () {
          if (currentStep === stepIndex && validateCurrentStep()) {
            goToStep(currentStep + 1);
            syncUIFromState();
          }
        }, AUTO_ADVANCE_MS);
      }
    });
  }

  function bindSlider() {
    areaSlider.addEventListener("input", function () {
      state.area = parseInt(areaSlider.value, 10);
      areaDisplay.textContent = "Площадь: " + state.area + " м²";
      areaSlider.setAttribute("aria-valuenow", String(state.area));
      if (currentStep === 2) updateNextEnabled();
    });
  }

  function bindZonesChange() {
    var grid = document.getElementById("zones-grid");
    if (!grid) return;
    grid.addEventListener("change", function () {
      if (currentStep === 1) {
        zonesError.hidden = true;
        updateNextEnabled();
      }
    });
  }

  function bindFormInputs() {
    var map = [
      ["f-name", "name"],
      ["f-phone", "phone"],
      ["f-email", "email"],
      ["f-comment", "comment"],
    ];
    map.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.addEventListener("input", function () {
        state[pair[1]] = el.value;
      });
    });
  }

  function showSuccessView() {
    steps.forEach(function (el) {
      el.classList.remove("is-active");
      el.hidden = true;
    });
    successScreen.hidden = false;
    successScreen.classList.add("is-active");
    quizNav.classList.add("is-hidden");
    progressBar.style.width = "100%";
    stepLabel.textContent = "Готово";
    trackEvent("quiz_success");
  }

  function showFormError(msg) {
    formGlobalError.textContent = msg || "Не удалось отправить заявку. Пожалуйста, попробуйте ещё раз.";
    formGlobalError.hidden = false;
  }

  function hideFormError() {
    formGlobalError.hidden = true;
  }

  function validateForm() {
    phoneError.hidden = true;
    if (emailError) emailError.hidden = true;
    consentError.hidden = true;
    hideFormError();

    state.name = document.getElementById("f-name").value;
    state.phone = document.getElementById("f-phone").value;
    state.email = document.getElementById("f-email").value;
    state.comment = document.getElementById("f-comment").value;

    var ok = true;
    if (!state.phone.trim()) {
      phoneError.textContent = "Укажите телефон";
      phoneError.hidden = false;
      ok = false;
    } else if (!isValidPhone(state.phone)) {
      phoneError.textContent = "Введите корректный номер телефона";
      phoneError.hidden = false;
      ok = false;
    }

    if (emailError && !isValidEmailOptional(state.email)) {
      emailError.textContent = "Проверьте формат e-mail";
      emailError.hidden = false;
      ok = false;
    }

    var consent = document.getElementById("f-consent").checked;
    if (!consent) {
      consentError.hidden = false;
      ok = false;
    }

    return ok;
  }

  async function submitPayload(payload) {
    if (!SUBMIT_URL) {
      console.log("Quiz payload (демо, обработчик не задан):", JSON.stringify(payload, null, 2));
      await new Promise(function (r) {
        setTimeout(r, 700);
      });
      return { ok: true };
    }

    var res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      var text = await res.text().catch(function () {
        return "";
      });
      throw new Error(text || "HTTP " + res.status);
    }

    return { ok: true };
  }

  btnNext.addEventListener("click", function () {
    if (!validateCurrentStep()) return;
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
      syncUIFromState();
    }
  });

  btnBack.addEventListener("click", function () {
    if (currentStep > 0) {
      if (currentStep === TOTAL_STEPS - 1) {
        state.name = document.getElementById("f-name").value;
        state.phone = document.getElementById("f-phone").value;
        state.email = document.getElementById("f-email").value;
        state.comment = document.getElementById("f-comment").value;
      }
      goToStep(currentStep - 1);
      syncUIFromState();
    }
  });

  contactForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    if (submitLocked) return;
    submitLocked = true;
    btnSubmit.disabled = true;
    hideFormError();

    var payload = buildPayload();
    trackEvent("quiz_submit", { step: TOTAL_STEPS });

    try {
      await submitPayload(payload);
      showSuccessView();
    } catch (err) {
      console.error(err);
      showFormError("Не удалось отправить заявку. Пожалуйста, попробуйте ещё раз.");
    } finally {
      submitLocked = false;
      btnSubmit.disabled = false;
    }
  });

  btnRestart.addEventListener("click", function () {
    state = {
      room_type: "",
      zones: [],
      area: 60,
      style: "",
      budget: "",
      name: "",
      phone: "",
      email: "",
      comment: "",
    };
    currentStep = 0;
    contactForm.reset();
    document.getElementById("f-consent").checked = false;
    zonesError.hidden = true;
    phoneError.hidden = true;
    if (emailError) emailError.hidden = true;
    consentError.hidden = true;
    hideFormError();
    syncUIFromState();
    showStep(0);
    trackEvent("quiz_start");
    trackEvent("quiz_step_1");
  });

  bindSingleChoice(0, "room_type");
  bindSingleChoice(3, "style");
  bindSingleChoice(4, "budget");
  bindSlider();
  bindFormInputs();
  bindZonesChange();

  steps.forEach(function (el, i) {
    el.hidden = i !== 0;
    el.classList.toggle("is-active", i === 0);
  });
  successScreen.hidden = true;
  setProgress();
  btnNext.style.display = "";
  updateNextEnabled();

  trackEvent("quiz_start");
  trackEvent("quiz_step_1");

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.documentElement.classList.add("is-ready");
    });
  });
})();

