    const SPECIES_REGISTRY = [
      {
        id: "cat",
        slug: "cat",
        nameAr: "القطة المنزلية",
        latin: "Felis catus",
        status: "active-draft",
        statusLabelAr: "متاح للجميع (26 عقدة)",
        badgeClass: "badge-pilot",
        image: "/assets/species-1.webp",
        imageAlt: "صورة تحريرية ترحيبية للقطة المنزلية — منفصلة عن المجسم التشريحي العلمي",
        summaryAr: "محور العمل الحالي في الأطلس، بدءًا بعينة الجهاز الهيكلي المشتق من مسح فوتوغرامتري حقيقي بـ 26 عقدة تشريحية ومصطلحات NAV الطبعة السادسة (مسودة بانتظار مراجعة اختصاصي).",
        catalogUrl: "/cat/skeleton/catalog.json",
        studyUrl: "/cat/skeleton/",
        systems: [
          { id: "skeletal", ar: "الجهاز الهيكلي", latin: "Systema skeletale", status: "draft-preview", statusAr: "مسودة معاينة (26 عقدة)", url: "/cat/skeleton/", catalogUrl: "/cat/skeleton/catalog.json", desc: "عينة مسح فوتوغرامتري لقطة كاملة (Tavernier Amaury، CC BY-NC-SA 4.0) مفصولة إلى 10 عظام منفردة و16 مجموعة عظام مندمجة سطحيًا بانتظار اعتماد اختصاصي." },
          { id: "cardiovascular", ar: "الجهاز الوعائي (الشرايين)", latin: "Systema cardiovasculare", status: "unavailable", statusAr: "غير متاح حاليًا", url: null, desc: "معلّق بانتظار مصدر هندسي موثّق لشرايين القطة المنزلية وبيانات مطابقة مكانية متسقة؛ لا اشتقاق من الكلب ولا تخمين للمسارات." },
          { id: "muscular", ar: "الجهاز العضلي", latin: "Systema musculare", status: "planned", statusAr: "قيد التخطيط", url: null, desc: "سيُضاف لاحقًا عند توفر عينة قططية موثّقة ومراجعة تشريحية." },
          { id: "nervous", ar: "الجهاز العصبي", latin: "Systema nervosum", status: "planned", statusAr: "قيد التخطيط", url: null, desc: "سيُضاف لاحقًا عند توفر بيانات تشريحية موثّقة للقطة." }
        ]
      },
      {
        id: "dog",
        slug: "dog",
        nameAr: "الكلب المنزلي",
        latin: "Canis lupus familiaris",
        status: "active-draft",
        statusLabelAr: "عينة متاحة للجميع (26 عقدة)",
        badgeClass: "badge-pilot",
        image: "/assets/species-0.webp",
        imageAlt: "صورة تحريرية ترحيبية للكلب المنزلي — منفصلة عن المجسم التشريحي العلمي",
        summaryAr: "عينة الجهاز الهيكلي للكلب المنزلي المشتق من مسح فوتوغرامتري حقيقي (مجموعة ثانوية Hoche — فرساي، Tavernier Amaury، CC BY-NC-SA 4.0) بـ 26 عقدة تشريحية وفق NAV الطبعة السادسة (مسودة بانتظار مراجعة اختصاصي).",
        catalogUrl: "/dog/skeleton/catalog.json",
        studyUrl: "/dog/skeleton/",
        systems: [
          { id: "skeletal", ar: "الجهاز الهيكلي", latin: "Systema skeletale", status: "draft-preview", statusAr: "مسودة معاينة (26 عقدة)", url: "/dog/skeleton/", catalogUrl: "/dog/skeleton/catalog.json", desc: "عينة مسح فوتوغرامتري لهيكل كلب كامل (Tavernier Amaury، CC BY-NC-SA 4.0) مفصولة إلى 10 عظام منفردة و16 مجموعة عظام مندمجة سطحيًا بانتظار اعتماد اختصاصي." }
        ]
      }
    ];
const ARTICLE_REGISTRY = [];
