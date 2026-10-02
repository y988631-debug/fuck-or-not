<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  maxSize?: number
  maxCount?: number
}>(), {
  maxSize: 20,
  maxCount: 9,
})
const emit = defineEmits<{
  uploaded: [items: (File | string)[]]
  error: [message: string]
}>()

const modelValue = defineModel<(File | string)[]>({ default: () => [] })
const fileInput = ref<HTMLInputElement>()
const dragCounter = ref(0)
const isDragOver = computed(() => dragCounter.value > 0)

// 模式切换: 'file' 上传文件, 'url' 图片链接
const inputMode = ref<'file' | 'url'>('file')
const urlInput = ref('')

// 是否有值
const hasValue = computed(() => (modelValue.value?.length ?? 0) > 0)
const canAddMore = computed(() => (modelValue.value?.length ?? 0) < props.maxCount)

// 本地文件的预览 URL 缓存
const objectUrlCache = new Map<File, string>()

function getPreviewUrl(item: File | string): string {
  if (typeof item === 'string')
    return item
  let url = objectUrlCache.get(item)
  if (!url) {
    url = URL.createObjectURL(item)
    objectUrlCache.set(item, url)
  }
  return url
}

function revokeObjectUrl(item: File | string) {
  if (item instanceof File) {
    const url = objectUrlCache.get(item)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlCache.delete(item)
    }
  }
}

function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (!canAddMore.value) {
      emit('error', `最多只能添加 ${props.maxCount} 张图片`)
      break
    }
    if (!file.type.startsWith('image/')) {
      emit('error', '请选择图片格式')
      continue
    }

    const maxSizeInBytes = props.maxSize * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      emit('error', `图片「${file.name}」大小不能超过 ${props.maxSize}MB`)
      continue
    }

    modelValue.value = [...(modelValue.value ?? []), file]
  }
  if (modelValue.value?.length)
    emit('uploaded', modelValue.value)
}

function handleInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length)
    addFiles(target.files)
  // 允许重复选择同一文件
  target.value = ''
}

function removeAt(index: number) {
  const item = modelValue.value?.[index]
  if (item !== undefined)
    revokeObjectUrl(item)
  modelValue.value = (modelValue.value ?? []).filter((_, i) => i !== index)
}

function clearAll() {
  for (const item of modelValue.value ?? [])
    revokeObjectUrl(item)
  modelValue.value = []
  urlInput.value = ''
  if (fileInput.value)
    fileInput.value.value = ''
}

function handleClick() {
  if (inputMode.value === 'file')
    fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter.value = 0
  if (inputMode.value !== 'file')
    return
  const files = e.dataTransfer?.files
  if (files && files.length > 0)
    addFiles(files)
}

function openPreview(item: File | string) {
  window.open(getPreviewUrl(item), '_blank')
}

function addUrl() {
  const url = urlInput.value.trim()
  if (!url)
    return
  if (!canAddMore.value) {
    emit('error', `最多只能添加 ${props.maxCount} 张图片`)
    return
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url)
  }
  catch {
    emit('error', '链接格式不正确')
    return
  }
  modelValue.value = [...(modelValue.value ?? []), url]
  urlInput.value = ''
  emit('uploaded', modelValue.value)
  // 收起键盘
  ;(document.activeElement as HTMLElement)?.blur()
}

function switchMode(mode: 'file' | 'url') {
  clearAll()
  inputMode.value = mode
}
</script>

<template>
  <div>
    <!-- 模式切换 -->
    <div mb-3 flex="~ gap-1 wrap items-center" p-1 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit>
      <button
        px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 cursor-pointer
        :class="inputMode === 'file'
          ? 'bg-teal-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400'"
        @click="switchMode('file')"
      >
        图片文件
      </button>
      <button
        px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 cursor-pointer
        :class="inputMode === 'url'
          ? 'bg-teal-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400'"
        @click="switchMode('url')"
      >
        外部链接
      </button>
    </div>

    <!-- 文件上传模式 -->
    <div v-if="inputMode === 'file'" @drop="handleDrop" @dragleave.prevent.stop="dragCounter--" @dragenter.prevent.stop="dragCounter++" @dragover.prevent.stop>
      <input
        ref="fileInput" accept="image/*" type="file" multiple hidden
        @change="handleInputChange"
      >

      <!-- 空状态：点击 / 拖拽上传 -->
      <div
        v-if="!hasValue"
        border="2 base hover-base rounded-md dashed"
        :class="isDragOver ? '!border-teal-600 !dark:border-teal-700' : ''"
        min-h-40 w-full cursor-pointer relative overflow-hidden
        @click="handleClick"
      >
        <div
          v-show="!isDragOver"
          flex="~ col items-center justify-center gap-2"
          opacity-60
          h-full min-h-40
        >
          <div i-carbon-add-large text-2xl />
          <div text-xs>
            点击或拖拽上传，可多选（最多 {{ maxCount }} 张）
          </div>
        </div>

        <div
          v-show="isDragOver"
          flex="~ col items-center justify-center"
          bg="light dark:dark"
          opacity-60 h-full min-h-40 transition duration-200
        >
          <div i-carbon-document-add text-2xl />
        </div>
      </div>

      <!-- 已选图片缩略图 -->
      <div v-else grid="~ cols-3 gap-2">
        <div
          v-for="(item, index) in modelValue"
          :key="index"
          relative border="~ base rounded-md" overflow-hidden
        >
          <img
            :src="getPreviewUrl(item)"
            class="preview"
            w-full h-24 object-cover block cursor-zoom-in
            @click="openPreview(item)"
          >
          <button
            absolute top-1 right-1 z-10 w-5 h-5
            flex="~ items-center justify-center"
            rounded-full bg="black/50" text-white text-xs
            cursor-pointer hover:bg-red-500 transition-colors duration-200
            title="移除这张图片"
            @click.stop="removeAt(index)"
          >
            ×
          </button>
        </div>
        <!-- 继续添加 -->
        <div
          v-if="canAddMore"
          border="2 base hover-base rounded-md dashed"
          :class="isDragOver ? '!border-teal-600 !dark:border-teal-700' : ''"
          h-24 cursor-pointer
          flex="~ col items-center justify-center gap-1"
          opacity-60 hover:opacity-100 transition-opacity duration-200
          @click="handleClick"
        >
          <div i-carbon-add-large text-xl />
          <div text-xs>
            {{ modelValue?.length ?? 0 }}/{{ maxCount }}
          </div>
        </div>
      </div>
    </div>

    <!-- URL 模式 -->
    <div v-else flex="~ col gap-3">
      <div flex="~ gap-2">
        <input
          v-model="urlInput"
          type="url"
          placeholder="粘贴图片链接，回车或点击「添加」，可添加多个"
          w-full px-3 py-2 rounded-lg
          border="~ base focus:teal-600"
          bg="transparent"
          outline="none"
          transition-colors duration-200
          @keydown.enter="addUrl"
        >
        <button
          shrink-0 text-xs text-white font-bold rounded-md px-4 py-2
          bg-teal-600 hover:bg-teal-700
          cursor-pointer transition-colors duration-200
          @click="addUrl"
        >
          添加
        </button>
      </div>

      <div v-if="hasValue" grid="~ cols-3 gap-2">
        <div
          v-for="(item, index) in modelValue"
          :key="index"
          relative border="~ base rounded-md" overflow-hidden
        >
          <img
            :src="getPreviewUrl(item)"
            class="preview"
            w-full h-24 object-cover block cursor-zoom-in
            @click="openPreview(item)"
          >
          <button
            absolute top-1 right-1 z-10 w-5 h-5
            flex="~ items-center justify-center"
            rounded-full bg="black/50" text-white text-xs
            cursor-pointer hover:bg-red-500 transition-colors duration-200
            title="移除这张图片"
            @click.stop="removeAt(index)"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
