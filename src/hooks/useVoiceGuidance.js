import { useCallback, useEffect, useRef } from 'react'
import { formatStepInstruction } from '../services/navigation.js'

// Web Speech API turn-by-turn voice — does not touch route geometry logic.
export function useVoiceGuidance({ enabled, step, nextStep }) {
  const spokenRef = useRef(new Set())
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const speak = useCallback((text) => {
    if (!enabledRef.current || !text || typeof window === 'undefined') return
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.05
    utter.pitch = 1
    const voices = window.speechSynthesis.getVoices()
    const en = voices.find((v) => v.lang.startsWith('en'))
    if (en) utter.voice = en
    window.speechSynthesis.speak(utter)
  }, [])

  useEffect(() => {
    if (!enabled || !step) return
    const key = `${step.index}-${step.instruction}`
    if (spokenRef.current.has(key)) return
    spokenRef.current.add(key)
    speak(step.instruction)
  }, [enabled, step, speak])

  useEffect(() => {
    if (!enabled || !nextStep) return
    const key = `next-${nextStep.index}-${nextStep.instruction}`
    if (spokenRef.current.has(key)) return
    if (nextStep.distanceToEnd != null && nextStep.distanceToEnd > 30) return
    spokenRef.current.add(key)
    speak(`In ${Math.round(nextStep.distanceToEnd || 0)} meters, ${nextStep.instruction}`)
  }, [enabled, nextStep, speak])

  useEffect(() => {
    if (!enabled) {
      spokenRef.current.clear()
      window.speechSynthesis?.cancel()
    }
  }, [enabled])

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel()
    },
    [],
  )

  return { speak }
}

export function stepForVoice(steps, index) {
  if (!steps?.[index]) return null
  return {
    index,
    instruction: formatStepInstruction(steps[index]),
  }
}
