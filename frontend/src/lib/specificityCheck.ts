// Non-blocking client-side mirror of form_validator.py's check_specificity —
// a hint only; the backend re-validates authoritatively on submit. Shared by
// ErrorGuideFormFields (causes) and ProcedureFormFields (steps), both of
// which warn on the same "vague resolution text" shape.
const T_CODE_REGEX = /\b[A-Z]{2,5}\d{1,4}[A-Z]?\b/
const ERROR_CODE_REGEX = /\b[A-Z]{1,4}\d{2,6}\b/

export function lacksSpecificity(text: string, acknowledged: boolean): boolean {
  if (acknowledged || !text) return false
  const hasEntity = T_CODE_REGEX.test(text) || ERROR_CODE_REGEX.test(text)
  const hasKeyword = /(TAB|FIELD|SCREEN|TRANSACTION|T-CODE)/i.test(text)
  return !hasEntity && !hasKeyword && text.length < 80
}
