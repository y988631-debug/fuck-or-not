<script setup lang="ts">
import { computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import Button from '~/components/Button.vue'
import ImageUploader from '~/components/ImageUploader.vue'
import MarkdownRenderer from '~/components/MarkdownRenderer.vue'
import Select from '~/components/Select.vue'
import { useAnalyse } from '~/composables/useAnalyse'
import { version } from '../../package.json'

defineOptions({
  name: 'IndexPage',
})

const {
  images,
  isTextOnlyMode,
  selectedProviderId,
  selectedModelId,
  selectedPromptId,
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
} = useAnalyse()

const isDev = import.meta.env.DEV

// 正在生成 或 已有结果但未保存 时，离开路由需确认
const hasUnsavedWork = computed(() =>
  analyseButtonLoading.value || (result.value !== '' && !saveButtonDisabled.value),
)

onBeforeRouteLeave(() => {
  if (!hasUnsavedWork.value)
    return true
  const message = analyseButtonLoading.value
    ? '正在生成结果，离开页面将中断本次分析，确定要离开吗？'
    : '当前结果尚未保存，离开页面后将丢失，确定要离开吗？'
  return window.confirm(message)
})
</script>

<template>
  <div mb-6 text-left px-1>
    <h1 text-3xl font-bold flex="~ items-center" gap-2>
      Fuck or Not
      <span text-xs font-mono font-normal class="bg-emerald-500/10" px-2 py-0.5 rounded-full text-emerald-700 dark:text-emerald-400 border="~ emerald-500/20 dark:emerald-400/20">
        v{{ version }}
      </span>
    </h1>
    <p text-sm op-50 mt-1>
      上还是不上？
    </p>
  </div>

  <!-- 配置区 -->
  <div mb-4 rounded-xl border="~ base" bg="white dark:black" p-6 text-left>
    <div mb-5>
      <span label ml-0.5>供应商</span>
      <Select v-model="selectedProviderId" :options="providerSelectOptions" />
    </div>
    <div mb-5>
      <span label ml-0.5>模型</span>
      <Select v-model="selectedModelId" :options="modelSelectOptions" />
    </div>
    <div>
      <span label ml-0.5>Prompt</span>
      <Select v-model="selectedPromptId" :options="promptSelectOptions" />
    </div>
  </div>

  <!-- 上传区 -->
  <div mb-4 rounded-xl border="~ base" bg="white dark:black" p-6 text-left>
    <span label ml-0.5>上传图片（可选，支持多图）</span>
    <ImageUploader v-model="images" />
  </div>

  <!-- 额外提示词 / 纯文本生成输入 -->
  <div mb-4 rounded-xl border="~ base" bg="white dark:black" p-6 text-left>
    <span label block mb-3>{{ isTextOnlyMode ? '提示词（未上传图片时将直接生成内容）' : '额外提示词（可选）' }}</span>

    <!-- 标签栏 -->
    <div v-if="additionalPromptPresets.length > 0" flex="~ wrap" gap-2 mb-3>
      <span
        v-for="preset in additionalPromptPresets"
        :key="preset.id"
        flex="~ items-center"
      >
        <button
          flex="~ items-center" px-3 py-1.5 rounded-l-lg
          text-xs border="~ base r-transparent" transition-colors duration-200
          :class="selectedAdditionalPresetId === preset.id
            ? 'bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-300'
            : 'bg-transparent hover:border-teal-400'"
          :title="preset.content"
          @click="handleSelectPreset(preset.id)"
        >
          <span max-w-32 truncate>{{ preset.name }}</span>
        </button>
        <button
          flex="~ items-center justify-center" px-1.5 py-1.5 rounded-r-lg
          text-xs border="~ l-transparent base"
          bg-transparent
          op-40 hover="op-100"
          transition-colors duration-200
          :title="`删除「${preset.name}」`"
          @click="handleDeletePreset(preset.id)"
        >×</button>
      </span>
    </div>

    <!-- textarea -->
    <textarea
      v-model="additionalPrompt"
      :placeholder="isTextOnlyMode
        ? '未上传图片：在这里描述场景、角色或情节，AI 将根据所选 Prompt 直接生成故事……'
        : '描述图片细节或补充说明，帮助 AI 更好地理解和分析……'"
      rows="3"
      w-full px-3 py-2 rounded-lg
      border="~ base focus:teal-600"
      bg="transparent"
      outline="none"
      resize-y
      transition-colors duration-200
      mb-2
    />

    <!-- 保存按钮 -->
    <div flex justify-end mt-1>
      <button
        v-if="additionalPrompt.trim()"
        text-xs text-white font-bold rounded-md px-4 py-2
        bg-teal-600 hover:bg-teal-700
        cursor-pointer transition-colors duration-200
        @click="handleSaveAsPreset"
      >
        保存为预设
      </button>
    </div>
  </div>

  <!-- 分析按钮 -->
  <Button
    :loading="analyseButtonLoading" :disabled="analyseButtonDisabled"
    :disable-on-loading="true"
    :loading-text="isTextOnlyMode ? '生成中...' : '分析中...'" @click="handleAnalyseButtonClick"
  >
    {{ isTextOnlyMode ? '生成' : '分析' }}
  </Button>

  <!-- 测试按钮（仅 dev 模式显示） -->
  <div v-if="isDev" flex justify-end mt-2>
    <button
      text-xs rounded-md px-3 py-1.5 border="~ dashed base"
      op-60 hover="op-100 border-teal-500 text-teal-600"
      transition-colors duration-200 cursor-pointer
      @click="handleFillTestResult"
    >
      填充测试结果
    </button>
  </div>

  <!-- 结果区 -->
  <template v-if="result !== '' || errorMsg !== ''">
    <div mt-4 rounded-xl border="~ base" bg="white dark:black" p-6 text-left>
      <div flex="~ items-center justify-between gap-2" mb-4>
        <div flex="~ items-center gap-2">
          <div
            w-1 h-6 rounded-full
            :class="errorMsg !== '' ? 'bg-red-500' : 'bg-teal-500'"
          />
          <span text-lg font-semibold>分析结果</span>
        </div>

        <!-- 编辑/确认/取消按钮 -->
        <div v-if="result !== ''" flex="~ gap-2">
          <template v-if="isEditingResult">
            <button
              text-xs text-white font-bold rounded-md px-4 py-2
              bg-teal-600 hover:bg-teal-700
              cursor-pointer transition-colors duration-200
              @click="handleConfirmEditResult"
            >
              确认编辑
            </button>
            <button
              text-xs text-white font-bold rounded-md px-4 py-2
              bg-red-400 hover:bg-red-500
              cursor-pointer transition-colors duration-200
              @click="handleCancelEditResult"
            >
              取消
            </button>
          </template>
          <button
            v-else
            text-xs text-white font-bold rounded-md px-4 py-2
            bg-teal-600 hover:bg-teal-700
            cursor-pointer transition-colors duration-200
            @click="handleStartEditResult"
          >
            编辑结果
          </button>
        </div>
      </div>

      <div
        v-if="errorMsg !== ''"
        p="x-4 y-3" rounded-lg
        whitespace-pre-wrap font-bold
        class="bg-red-400 text-white"
      >
        {{ errorMsg }}
      </div>

      <div v-if="result !== ''">
        <textarea
          v-if="isEditingResult"
          v-model="editedResultText"
          rows="12"
          w-full px-3 py-2 rounded-lg
          border="~ base focus:teal-600"
          bg="transparent"
          outline="none"
          resize-y
          transition-colors duration-200
        />
        <div
          v-else
          select-text
        >
          <MarkdownRenderer :content="result" />
        </div>
      </div>
    </div>

    <!-- 延续对话 -->
    <div v-if="result !== ''" mt-4 rounded-xl border="~ base" bg="white dark:black" p-6 text-left>
      <div flex="~ items-center gap-2" mb-4>
        <div w-1 h-6 rounded-full bg-teal-500 />
        <span text-lg font-semibold>延续对话</span>
      </div>

      <!-- 历史问答 -->
      <div v-for="(turn, index) in followupTurns" :key="index" mb-5>
        <div flex justify-end mb-2>
          <div
            px-3 py-2 rounded-lg text-sm whitespace-pre-wrap max-w-85%
            bg-teal-600 text-white
          >
            {{ turn.question }}
          </div>
        </div>
        <div select-text>
          <MarkdownRenderer :content="turn.answer" />
        </div>
      </div>

      <!-- 流式生成中的回答 -->
      <div v-if="followupLoading" mb-5>
        <MarkdownRenderer v-if="followupStreamingAnswer" :content="followupStreamingAnswer" />
        <div v-else text-sm op-60>
          正在生成...
        </div>
      </div>

      <!-- 输入区 -->
      <div flex="~ col gap-2">
        <textarea
          v-model="followupInput"
          placeholder="基于以上结果继续提问、补充设定或要求续写……（Enter 发送，Shift+Enter 换行）"
          rows="2"
          w-full px-3 py-2 rounded-lg
          border="~ base focus:teal-600"
          bg="transparent"
          outline="none"
          resize-y
          transition-colors duration-200
          :disabled="followupLoading"
          @keydown.enter.exact.prevent="handleSendFollowup"
        />
        <div flex justify-end>
          <button
            text-xs text-white font-bold rounded-md px-4 py-2
            bg-teal-600 hover:bg-teal-700
            disabled:op-50 disabled:cursor-not-allowed
            cursor-pointer transition-colors duration-200
            :disabled="followupLoading || !followupInput.trim()"
            @click="handleSendFollowup"
          >
            {{ followupLoading ? '发送中...' : '发送' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="result !== ''" mt-3>
      <Button
        :disabled="saveButtonDisabled" disabled-text="已保存"
        @click="handleSaveButtonClick"
      >
        保存结果
      </Button>
    </div>
  </template>
</template>
