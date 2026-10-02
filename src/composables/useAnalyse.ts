import type { FavoriteResult } from '~/types'
import { useStorage } from '@vueuse/core'
import { computed, ref, watch, watchEffect } from 'vue'
import { addAdditionalPreset, additionalPromptPresets, computeStringHash, customPrompts, favoriteResults, fileToBase64, generateContent, getPromptById, providers, removeAdditionalPreset, saveImage } from '~/logic'

/** 多轮对话消息（Gemini 原生格式，logic 层会转换为 OpenAI 格式） */
export interface ChatMessage {
  role: 'user' | 'model'
  parts: any[]
}

/** 延续对话的一轮问答（用于界面展示与保存） */
export interface FollowupTurn {
  question: string
  answer: string
}

interface PendingImage {
  base64: string
  mimeType: string
  sourceUrl?: string
}

export function useAnalyse() {
  const images = ref<(File | string)[]>([])

  const selectedProviderId = useStorage<string | undefined>('selected-provider-id', undefined)
  const selectedModelId = useStorage('selected-model', '')
  const selectedPromptId = useStorage('selected-prompt-id', 'novel')
  const additionalPrompt = ref('')
  const result = ref('')
  const errorMsg = ref('')
  const analyseButtonLoading = ref(false)
  const saveButtonDisabled = ref(false)

  // 结果编辑
  const isEditingResult = ref(false)
  const editedResultText = ref('')

  // 延续对话
  const chatHistory = ref<ChatMessage[]>([])
  const followupTurns = ref<FollowupTurn[]>([])
  const followupInput = ref('')
  const followupLoading = ref(false)
  const followupStreamingAnswer = ref('')

  const lastFavoriteResult = ref<FavoriteResult | null>(null)

  const selectedProvider = computed(() => {
    if (!selectedProviderId.value)
      return undefined
    return providers.value.find(p => p.id === selectedProviderId.value)
  })

  // 纯文本模式：未上传任何图片
  const isTextOnlyMode = computed(() => images.value.length === 0)

  // 当供应商 id 改变时，清空已选的模型
  watch(selectedProviderId, () => {
    selectedModelId.value = ''
  })

  // 确保选中的 Prompt ID 有效
  watchEffect(() => {
    const prompts = customPrompts.value
    const exists = prompts.some(p => p.id === selectedPromptId.value)
    if (!exists && prompts.length > 0)
      selectedPromptId.value = prompts[0].id
  })

  const providerSelectOptions = computed(() =>
    providers.value.map(p => ({ label: p.name, value: p.id })),
  )

  const modelSelectOptions = computed(() => {
    if (!selectedProvider.value)
      return []
    return selectedProvider.value.models.map(m => ({ label: m, value: m }))
  })

  const promptSelectOptions = computed(() =>
    customPrompts.value.map(prompt => ({ label: prompt.name, value: prompt.id })),
  )

  const selectedPrompt = computed(() => getPromptById(selectedPromptId.value))

  const analyseButtonDisabled = computed(() => {
    if (!selectedModelId.value || !selectedPromptId.value || !selectedProvider.value)
      return true
    // 有图片即可分析；没有图片时，需要填写提示词以纯文本生成
    return isTextOnlyMode.value && !additionalPrompt.value.trim()
  })

  // 额外提示词预设（标签栏模式）
  const selectedAdditionalPresetId = ref<string | null>(null)

  function handleSelectPreset(id: string) {
    if (selectedAdditionalPresetId.value === id) {
      selectedAdditionalPresetId.value = null
      return
    }
    selectedAdditionalPresetId.value = id
    const preset = additionalPromptPresets.value.find(p => p.id === id)
    if (preset)
      additionalPrompt.value = preset.content
  }

  function handleDeletePreset(id: string) {
    if (!window.confirm('确定要删除这个预设吗？')) {
      ;(document.activeElement as HTMLElement)?.blur()
      return
    }
    if (selectedAdditionalPresetId.value === id)
      selectedAdditionalPresetId.value = null
    removeAdditionalPreset(id)
  }

  function handleSaveAsPreset() {
    const content = additionalPrompt.value.trim()
    if (!content)
      return
    const name = window.prompt('输入预设标签名：', '')
    if (!name || !name.trim())
      return
    selectedAdditionalPresetId.value = addAdditionalPreset(name.trim(), content)
  }

  function handleStartEditResult() {
    editedResultText.value = result.value
    isEditingResult.value = true
  }

  function handleConfirmEditResult() {
    result.value = editedResultText.value
    if (lastFavoriteResult.value)
      lastFavoriteResult.value.result = editedResultText.value
    isEditingResult.value = false
  }

  function handleCancelEditResult() {
    isEditingResult.value = false
  }

  // 仅用于开发测试
  function handleFillTestResult() {
    errorMsg.value = ''
    isEditingResult.value = false
    saveButtonDisabled.value = false
    chatHistory.value = []
    followupTurns.value = []
    result.value = [
      '## 测试结果',
      '',
      '这是一段用于**开发测试**的模拟分析结果。',
      '',
      '- 列表项一',
      '- 列表项二',
      '- 列表项三',
      '',
      '> 引用：你可以点击「编辑结果」来测试编辑功能。',
      '',
      '```js',
      'console.log(\'hello fuck-or-not\')',
      '```',
    ].join('\n')
    lastFavoriteResult.value = {
      model: selectedModelId.value || 'test-model',
      mode: selectedPromptId.value,
      imageHash: '',
      mimeType: 'image/png',
      time: Date.now(),
      result: result.value,
      prompt: selectedPrompt.value?.content ?? '',
      additionalPrompt: additionalPrompt.value.trim(),
      _pendingImages: [],
    } as any
  }

  async function urlToBase64(url: string): Promise<{ base64: string, mimeType: string }> {
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`无法获取图片: ${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const mimeType = blob.type || 'image/jpeg'
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i])
    return { base64: btoa(binary), mimeType }
  }

  function isBlockedResponse(response: any): boolean {
    return (response.candidates && response.candidates[0]?.finishReason === 'PROHIBITED_CONTENT')
      || !!response.promptFeedback?.blockReason
  }

  async function handleAnalyseButtonClick() {
    const provider = selectedProvider.value
    if (!provider) {
      errorMsg.value = '请先选择供应商。'
      return
    }

    if (!provider.apiKey) {
      errorMsg.value = `请先配置「${provider.name}」的 API 密钥。`
      return
    }

    if (isTextOnlyMode.value && !additionalPrompt.value.trim()) {
      errorMsg.value = '请上传图片，或不传图片时填写提示词直接生成内容。'
      return
    }
    for (const img of images.value) {
      if (img instanceof File && img.size > 20 * 1024 * 1024) {
        errorMsg.value = '单张图片大小不能超过 20MB，请选择较小的图片。'
        return
      }
    }

    if (!selectedPrompt.value) {
      errorMsg.value = '请先选择 Prompt。'
      return
    }

    analyseButtonLoading.value = true
    errorMsg.value = ''
    result.value = ''
    isEditingResult.value = false
    chatHistory.value = []
    followupTurns.value = []
    followupInput.value = ''
    followupStreamingAnswer.value = ''

    try {
      const systemInstruction = selectedPrompt.value.content || '分析这张图片'

      const userText = additionalPrompt.value.trim()

      // 组装本轮用户消息：所有图片 + 文字
      const userParts: any[] = []
      const pendingImages: PendingImage[] = []
      for (const img of images.value) {
        if (typeof img === 'string') {
          const { base64, mimeType } = await urlToBase64(img)
          userParts.push({ inlineData: { data: base64, mimeType } })
          pendingImages.push({ base64, mimeType, sourceUrl: img })
        }
        else {
          const base64 = await fileToBase64(img)
          userParts.push({ inlineData: { data: base64, mimeType: img.type } })
          pendingImages.push({ base64, mimeType: img.type })
        }
      }
      if (userText)
        userParts.push({ text: userText })
      if (userParts.length === 0)
        userParts.push({ text: '请根据系统提示词的要求生成内容。' })

      chatHistory.value = [{ role: 'user', parts: userParts }]

      const response = await generateContent(
        selectedModelId.value,
        chatHistory.value,
        systemInstruction,
        provider,
        (chunk) => {
          result.value += chunk
        },
      )

      console.log(response)
      if (response.text === '' || response.text === null || response.text === undefined) {
        if (isBlockedResponse(response)) {
          errorMsg.value = '内容被安全过滤器阻止，请重试或更换模型。'
        }
        else {
          errorMsg.value = '发生未知错误，请稍后再试或检查控制台日志。'
        }
        chatHistory.value = []
      }
      else {
        saveButtonDisabled.value = false
        result.value = response.text!
        errorMsg.value = ''
        chatHistory.value.push({ role: 'model', parts: [{ text: response.text! }] })
        lastFavoriteResult.value = {
          model: selectedModelId.value,
          mode: selectedPromptId.value,
          imageHash: '',
          mimeType: pendingImages[0]?.mimeType ?? '',
          time: Date.now(),
          result: response.text!,
          prompt: selectedPrompt.value?.content ?? '',
          additionalPrompt: additionalPrompt.value.trim(),
          _pendingImages: pendingImages,
        } as any
      }
    }
    catch (error) {
      console.error('[Analysis Error]', { provider: provider.name, error })
      errorMsg.value = `Error: ${(error as Error).message || String(error)}`
      chatHistory.value = []
    }
    finally {
      analyseButtonLoading.value = false
    }
  }

  // 基于当前结果延续对话
  async function handleSendFollowup() {
    const text = followupInput.value.trim()
    if (!text || followupLoading.value || analyseButtonLoading.value)
      return

    const provider = selectedProvider.value
    if (!provider) {
      errorMsg.value = '请先选择供应商。'
      return
    }
    if (!provider.apiKey) {
      errorMsg.value = `请先配置「${provider.name}」的 API 密钥。`
      return
    }
    if (chatHistory.value.length === 0) {
      errorMsg.value = '当前没有可延续的生成结果，请先点击「分析 / 生成」。'
      return
    }

    followupLoading.value = true
    followupStreamingAnswer.value = ''
    followupInput.value = ''
    errorMsg.value = ''

    try {
      chatHistory.value.push({ role: 'user', parts: [{ text }] })
      const response = await generateContent(
        selectedModelId.value,
        chatHistory.value,
        selectedPrompt.value?.content || '',
        provider,
        (chunk) => {
          followupStreamingAnswer.value += chunk
        },
      )

      const answer = response.text || ''
      if (!answer) {
        chatHistory.value.pop()
        followupInput.value = text
        errorMsg.value = isBlockedResponse(response)
          ? '内容被安全过滤器阻止，请重试或更换模型。'
          : '发生未知错误，请稍后再试或检查控制台日志。'
        return
      }

      chatHistory.value.push({ role: 'model', parts: [{ text: answer }] })
      followupTurns.value.push({ question: text, answer })
      // 延续对话后允许重新保存
      saveButtonDisabled.value = false
    }
    catch (error) {
      console.error('[Followup Error]', { provider: provider.name, error })
      chatHistory.value.pop()
      followupInput.value = text
      errorMsg.value = `Error: ${(error as Error).message || String(error)}`
    }
    finally {
      followupLoading.value = false
      followupStreamingAnswer.value = ''
    }
  }

  async function handleSaveButtonClick() {
    saveButtonDisabled.value = true
    const pending = lastFavoriteResult.value as any
    if (!pending)
      return
    const pendingImages = (pending._pendingImages ?? []) as PendingImage[]

    // 保存时把延续对话追加到结果末尾
    let resultText = pending.result as string
    if (followupTurns.value.length > 0) {
      const conversation = followupTurns.value
        .map(turn => `**问：${turn.question}**\n\n${turn.answer}`)
        .join('\n\n')
      resultText = `${resultText}\n\n---\n\n## 延续对话\n\n${conversation}`
    }

    const item: FavoriteResult = {
      model: pending.model,
      mode: pending.mode,
      imageHash: '',
      mimeType: pendingImages[0]?.mimeType ?? '',
      time: pending.time,
      result: resultText,
      prompt: pending.prompt ?? '',
      additionalPrompt: pending.additionalPrompt ?? '',
    }

    // 收藏只保留第一张图片作为主要图片；纯文本生成则无图片
    const firstImage = pendingImages[0]
    if (firstImage?.sourceUrl) {
      item.imageHash = await computeStringHash(firstImage.sourceUrl)
      item.imageUrl = firstImage.sourceUrl
    }
    else if (firstImage) {
      item.imageHash = await saveImage(firstImage.base64, firstImage.mimeType)
    }

    if (!favoriteResults.data.value)
      favoriteResults.data.value = []
    favoriteResults.data.value.unshift(item)
  }

  return {
    images,
    isTextOnlyMode,
    selectedProviderId,
    selectedModelId,
    selectedPromptId,
    selectedProvider,
    selectedPrompt,
    additionalPrompt,
    result,
    errorMsg,
    analyseButtonLoading,
    analyseButtonDisabled,
    saveButtonDisabled,
    providerSelectOptions,
    modelSelectOptions,
    promptSelectOptions,
    additionalPromptPresets,
    selectedAdditionalPresetId,
    handleSelectPreset,
    handleDeletePreset,
    handleSaveAsPreset,
    handleAnalyseButtonClick,
    handleSaveButtonClick,
    isEditingResult,
    editedResultText,
    handleStartEditResult,
    handleConfirmEditResult,
    handleCancelEditResult,
    handleFillTestResult,
    followupTurns,
    followupInput,
    followupLoading,
    followupStreamingAnswer,
    handleSendFollowup,
  }
}
