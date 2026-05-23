export const EMOTION_KEYWORDS = {
  anger: {
    words: ['气', '怒', '操', '靠', '妈', '草', '特么', '尼玛', '气死', '气炸', '气疯', '火大', '恼火', '暴怒', '愤怒', '发火', '生气', '可恶', '该死', '混蛋', '王八蛋', '有病', '神经', '疯了', '受不了', '忍不了', '过分', '太过分', '岂有此理'],
    effect: 'crack',
    color: '#ff2222'
  },
  hate: {
    words: ['恨', '怨', '仇', '讨厌', '厌恶', '恶心', '烦死', '受够', '够了', '不要再', '永别', '再也不', '死心', '绝望'],
    effect: 'crack',
    color: '#cc0000'
  },
  death: {
    words: ['死', '杀', '灭', '亡', '宰', '干掉', '弄死', '搞死', '打死', '杀死', '去死', '见鬼', '下地狱', '毁灭', '完蛋', '崩了', '爆炸'],
    effect: 'fog',
    color: '#8800cc'
  },
  reject: {
    words: ['滚', '走开', '离我远点', '消失', '别来', '别烦', '别碰', '不要', '闭嘴', '住口', '别说了', '消停', '安静', '一边去', '远点', '滚蛋', '滚开', '走'],
    effect: 'fly',
    color: '#00ccff'
  },
  annoying: {
    words: ['烦', '躁', '闷', '憋', '受不了', '难受', '头疼', '头大', '崩溃', '抓狂', '发疯', '发狂', '忍不了', '够够的', '受罪', '折磨', '煎熬', '折磨人'],
    effect: 'flood',
    color: '#aa44ff'
  },
  stupid: {
    words: ['傻', '蠢', '笨', '废物', '垃圾', '白痴', '智障', '脑残', '二百五', '傻逼', '二货', '呆', '愣', '弱智', '猪', '蠢货', '饭桶', '没用', '废'],
    effect: 'distort',
    color: '#cc66ff'
  },
  sad: {
    words: ['哭', '泪', '伤', '痛', '心碎', '难过', '伤心', '悲伤', '痛苦', '心疼', '崩溃', '绝望', '心酸', '委屈', '憋屈', '可怜', '凄凉', '惨', '苦'],
    effect: 'cry',
    color: '#4488cc'
  },
  fear: {
    words: ['怕', '恐', '慌', '吓', '害怕', '恐惧', '惊恐', '心慌', '紧张', '焦虑', '不安', '担心', '发抖', '颤抖', '心虚'],
    effect: 'cry',
    color: '#668899'
  },
  exhausted: {
    words: ['累', '疲', '倦', '困', '乏', '疲惫', '疲劳', '心累', '好累', '累死', '困死', '不想动', '无力', '精疲力竭', '筋疲力尽'],
    effect: 'flood',
    color: '#556677'
  }
}

export const EMOTION_LABELS = {
  anger: '愤怒', hate: '怨恨', death: '毁灭', reject: '拒绝',
  annoying: '烦躁', stupid: '自嘲', sad: '悲伤', fear: '恐惧', exhausted: '疲惫'
}

export function analyzeWord(text) {
  if (!text) return { emotion: null, effectType: null, intensity: 0 }

  let emotion = null
  let effectType = null
  let matchedWord = ''

  for (const [key, config] of Object.entries(EMOTION_KEYWORDS)) {
    for (const w of config.words) {
      if (w.length > 1) {
        if (text.includes(w) && w.length > matchedWord.length) {
          emotion = key
          effectType = config.effect
          matchedWord = w
        }
      } else {
        for (const ch of text) {
          if (ch === w) {
            emotion = key
            effectType = config.effect
            matchedWord = w
            break
          }
        }
      }
    }
  }

  const intensity = Math.min(0.3 + text.length * 0.12, 1)
  return { emotion, effectType, intensity }
}

export function getEmotionColor(emotion) {
  const config = EMOTION_KEYWORDS[emotion]
  return config ? config.color : null
}

export function detectEmotion(text) {
  if (!text || text.length === 0) return null

  let bestMatch = null
  let bestLength = 0

  for (const [key, config] of Object.entries(EMOTION_KEYWORDS)) {
    for (const w of config.words) {
      if (w.length > 1 && text.includes(w) && w.length > bestLength) {
        bestMatch = { emotion: key, color: config.color, word: w, effect: config.effect }
        bestLength = w.length
      }
    }
  }

  if (!bestMatch) {
    for (const [key, config] of Object.entries(EMOTION_KEYWORDS)) {
      for (const w of config.words) {
        if (w.length === 1) {
          for (const ch of text) {
            if (ch === w) {
              bestMatch = { emotion: key, color: config.color, word: w, effect: config.effect }
              break
            }
          }
        }
        if (bestMatch) break
      }
      if (bestMatch) break
    }
  }

  return bestMatch
}
