'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { lessonCodeValid, lessonWriteError, missingLessonParentMessage, normalizeLessonCode } from '@/app/admin/academic/lesson-rules'

async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc(
    'has_role',
    {
      role_code: 'SUPER_ADMIN',
    }
  )

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=Unauthorized')
  }

  return supabase
}

export async function createCurriculum(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()

  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()

  if (!code || !name) {
    redirect(
      '/admin/academic?error=Curriculum%20code%20and%20name%20are%20required'
    )
  }

  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
    redirect(
      '/admin/academic?error=Curriculum%20code%20must%20contain%20only%20letters%2C%20numbers%2C%20_%20or%20-'
    )
  }

  const { data: created, error } = await supabase.from('curriculums').insert({
    code,
    name,
    description: description || null,
    status: 'ACTIVE',
  }).select('id').single()

  if (error || !created) {
    if (error?.code === '23505') {
      redirect(
        '/admin/academic?error=This%20curriculum%20code%20already%20exists'
      )
    }

    redirect(
      '/admin/academic?error=Could%20not%20create%20curriculum'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/academic')
  revalidatePath('/admin/programs')

  redirect(`/admin/academic/${created.id}`)
}

export async function setCurriculumStatus(formData: FormData) {
  const supabase = await requireSuperAdmin()

  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')

  if (!id || !['ACTIVE', 'INACTIVE'].includes(status)) {
    redirect(
      '/admin/academic?error=Invalid%20curriculum%20status'
    )
  }

  const { error } = await supabase
    .from('curriculums')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    redirect(
      '/admin/academic?error=Could%20not%20change%20curriculum%20status'
    )
  }

  revalidatePath('/admin')
  revalidatePath('/admin/academic')

  redirect(
    `/admin/academic?success=${encodeURIComponent('Đã cập nhật trạng thái chương trình')}`
  )
}
export async function createCurriculumLevel(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const sequenceNo = Number(
      formData.get('sequence_no') ?? 0
    )
  
    const levelNumberValue = String(
      formData.get('level_number') ?? ''
    ).trim()
  
    const levelNumber =
      levelNumberValue === ''
        ? null
        : Number(levelNumberValue)
  
    const levelType = String(
      formData.get('level_type') ?? 'GRADE'
    )
  
    const completionRule = String(
      formData.get('completion_rule') ??
        'ALL_REQUIRED_SUBJECTS'
    )
  
    if (!curriculumId || !code || !name) {
      redirect(
        `/admin/academic/${curriculumId}?error=Code%20and%20name%20are%20required`
      )
    }
  
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      redirect(
        `/admin/academic/${curriculumId}?error=Sequence%20must%20be%20a%20positive%20number`
      )
    }
  
    if (
      levelNumber !== null &&
      (!Number.isInteger(levelNumber) || levelNumber < 0)
    ) {
      redirect(
        `/admin/academic/${curriculumId}?error=Invalid%20level%20number`
      )
    }
  
    if (
      !['FOUNDATION', 'GRADE', 'DIPLOMA', 'OTHER'].includes(
        levelType
      )
    ) {
      redirect(
        `/admin/academic/${curriculumId}?error=Invalid%20level%20type`
      )
    }
  
    if (
      !['ALL_REQUIRED_SUBJECTS', 'MANUAL'].includes(
        completionRule
      )
    ) {
      redirect(
        `/admin/academic/${curriculumId}?error=Invalid%20completion%20rule`
      )
    }
  
    const { error } = await supabase
      .from('curriculum_levels')
      .insert({
        curriculum_id: curriculumId,
        code,
        name,
        sequence_no: sequenceNo,
        level_number: levelNumber,
        level_type: levelType,
        completion_rule: completionRule,
        status: 'ACTIVE',
      })
  
    if (error) {
      redirect(
        `/admin/academic/${curriculumId}?error=Could%20not%20create%20level`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
  
    redirect(
      `/admin/academic/${curriculumId}?success=${encodeURIComponent('Đã tạo cấp độ')}`
    )
  }
  export async function createCurriculumSubject(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const familyCode = String(
      formData.get('family_code') ?? ''
    )
      .trim()
      .toUpperCase()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const subjectLevelValue = String(
      formData.get('subject_level') ?? ''
    ).trim()
  
    const subjectLevel =
      subjectLevelValue === ''
        ? null
        : Number(subjectLevelValue)
  
    const sortOrder = Number(
      formData.get('sort_order') ?? 0
    )
  
    const completionRule = String(
      formData.get('completion_rule') ?? ''
    )
  
    const isRequired =
      formData.get('is_required') === 'true'
  
    if (!curriculumId || !levelId) {
      redirect(
        '/admin/academic?error=Invalid%20academic%20structure'
      )
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}/levels/${levelId}`
  
    if (!familyCode || !code || !name) {
      redirect(
        `${returnPath}?error=Family%20code%2C%20subject%20code%20and%20name%20are%20required`
      )
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(familyCode)) {
      redirect(
        `${returnPath}?error=Invalid%20family%20code`
      )
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
      redirect(
        `${returnPath}?error=Invalid%20subject%20code`
      )
    }
  
    if (
      subjectLevel !== null &&
      (!Number.isInteger(subjectLevel) || subjectLevel < 0)
    ) {
      redirect(
        `${returnPath}?error=Invalid%20subject%20level`
      )
    }
  
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      redirect(
        `${returnPath}?error=Invalid%20sort%20order`
      )
    }
  
    if (
      ![
        'ALL_REQUIRED_COMPONENTS',
        'DIRECT_ASSESSMENT',
      ].includes(completionRule)
    ) {
      redirect(
        `${returnPath}?error=Invalid%20completion%20rule`
      )
    }
  
    const { data: level } = await supabase
      .from('curriculum_levels')
      .select('id')
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
      .maybeSingle()
  
    if (!level) {
      redirect(
        `${returnPath}?error=Level%20does%20not%20belong%20to%20this%20curriculum`
      )
    }
  
    const { error } = await supabase
      .from('curriculum_subjects')
      .insert({
        level_id: levelId,
        family_code: familyCode,
        code,
        name,
        subject_level: subjectLevel,
        is_required: isRequired,
        completion_rule: completionRule,
        sort_order: sortOrder,
        status: 'ACTIVE',
      })
  
    if (error) {
      if (error.code === '23505') {
        redirect(
          `${returnPath}?error=This%20subject%20already%20exists`
        )
      }
  
      redirect(
        `${returnPath}?error=Could%20not%20create%20subject`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã tạo môn học')}`
    )
  }
  export async function createCurriculumSubjectComponent(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const subjectId = String(
      formData.get('subject_id') ?? ''
    ).trim()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const sortOrder = Number(
      formData.get('sort_order') ?? 0
    )
  
    const isRequired =
      formData.get('is_required') === 'true'

    const completionRule = String(formData.get('completion_rule') ?? '')
  
    if (!curriculumId || !levelId || !subjectId) {
      redirect(
        '/admin/academic?error=Invalid%20academic%20structure'
      )
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}` +
      `/levels/${levelId}` +
      `/subjects/${subjectId}`
  
    if (!code || !name) {
      redirect(
        `${returnPath}?error=Component%20code%20and%20name%20are%20required`
      )
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
      redirect(
        `${returnPath}?error=Invalid%20component%20code`
      )
    }
  
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      redirect(
        `${returnPath}?error=Invalid%20sort%20order`
      )
    }

    if (!['DIRECT_ASSESSMENT', 'ALL_REQUIRED_ITEMS'].includes(completionRule)) {
      redirect(
        `${returnPath}?error=Choose%20how%20the%20assessment%20group%20is%20completed`
      )
    }
  
    // Verify the level belongs to this curriculum.
    const { data: level } = await supabase
      .from('curriculum_levels')
      .select('id')
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
      .maybeSingle()
  
    if (!level) {
      redirect(
        `${returnPath}?error=Invalid%20curriculum%20level`
      )
    }
  
    // Verify the subject belongs to this level.
    const { data: subject } = await supabase
      .from('curriculum_subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('level_id', levelId)
      .maybeSingle()
  
    if (!subject) {
      redirect(
        `${returnPath}?error=Invalid%20subject`
      )
    }
  
    const { error } = await supabase
      .from('curriculum_subject_components')
      .insert({
        subject_id: subjectId,
        code,
        name,
        is_required: isRequired,
        sort_order: sortOrder,
        completion_rule: completionRule,
        status: 'ACTIVE',
      })
  
    if (error) {
      if (error.code === '23505') {
        redirect(
          `${returnPath}?error=This%20component%20already%20exists`
        )
      }
  
      redirect(
        `${returnPath}?error=Could%20not%20create%20component`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath('/admin/programs')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(
      `/admin/academic/${curriculumId}/levels/${levelId}`
    )
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã tạo nhóm đánh giá')}`
    )
  }
  export async function setCurriculumLevelStatus(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const status = String(
      formData.get('status') ?? ''
    ).trim()
  
    if (
      !curriculumId ||
      !levelId ||
      !['ACTIVE', 'INACTIVE'].includes(status)
    ) {
      redirect('/admin/academic?error=Invalid%20level%20status')
    }
  
    const returnPath = `/admin/academic/${curriculumId}`
  
    const { error } = await supabase
      .from('curriculum_levels')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
  
    if (error) {
      redirect(
        `${returnPath}?error=Could%20not%20change%20level%20status`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã cập nhật trạng thái cấp độ')}`
    )
  }
  
  export async function setCurriculumSubjectStatus(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const subjectId = String(
      formData.get('subject_id') ?? ''
    ).trim()
  
    const status = String(
      formData.get('status') ?? ''
    ).trim()
  
    if (
      !curriculumId ||
      !levelId ||
      !subjectId ||
      !['ACTIVE', 'INACTIVE'].includes(status)
    ) {
      redirect('/admin/academic?error=Invalid%20subject%20status')
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}/levels/${levelId}`
  
    const { error } = await supabase
      .from('curriculum_subjects')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subjectId)
      .eq('level_id', levelId)
  
    if (error) {
      redirect(
        `${returnPath}?error=Could%20not%20change%20subject%20status`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã cập nhật trạng thái môn học')}`
    )
  }
  
  export async function setCurriculumSubjectComponentStatus(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const subjectId = String(
      formData.get('subject_id') ?? ''
    ).trim()
  
    const componentId = String(
      formData.get('component_id') ?? ''
    ).trim()
  
    const status = String(
      formData.get('status') ?? ''
    ).trim()
  
    if (
      !curriculumId ||
      !levelId ||
      !subjectId ||
      !componentId ||
      !['ACTIVE', 'INACTIVE'].includes(status)
    ) {
      redirect(
        '/admin/academic?error=Invalid%20component%20status'
      )
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}` +
      `/levels/${levelId}` +
      `/subjects/${subjectId}`
  
    const { error } = await supabase
      .from('curriculum_subject_components')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', componentId)
      .eq('subject_id', subjectId)
  
    if (error) {
      redirect(
        `${returnPath}?error=Could%20not%20change%20component%20status`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(
      `/admin/academic/${curriculumId}/levels/${levelId}`
    )
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã cập nhật trạng thái nhóm đánh giá')}`
    )
  }
  export async function updateCurriculum(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const id = String(formData.get('id') ?? '').trim()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const description = String(
      formData.get('description') ?? ''
    ).trim()
  
    if (!id || !code || !name) {
      redirect(
        '/admin/academic?error=Invalid%20curriculum%20data'
      )
    }
  
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
      redirect(
        `/admin/academic/${id}?error=Invalid%20curriculum%20code`
      )
    }
  
    const { error } = await supabase
      .from('curriculums')
      .update({
        code,
        name,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  
    if (error) {
      if (error.code === '23505') {
        redirect(
          `/admin/academic/${id}?error=This%20curriculum%20code%20already%20exists`
        )
      }
  
      redirect(
        `/admin/academic/${id}?error=Could%20not%20update%20curriculum`
      )
    }
  
    revalidatePath('/admin')
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${id}`)
  
    redirect(
      `/admin/academic/${id}?success=${encodeURIComponent('Đã cập nhật chương trình')}`
    )
  }
  export async function updateCurriculumLevel(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const sequenceNo = Number(
      formData.get('sequence_no') ?? 0
    )
  
    const levelNumberValue = String(
      formData.get('level_number') ?? ''
    ).trim()
  
    const levelNumber =
      levelNumberValue === ''
        ? null
        : Number(levelNumberValue)
  
    const levelType = String(
      formData.get('level_type') ?? 'GRADE'
    )
  
    const completionRule = String(
      formData.get('completion_rule') ??
        'ALL_REQUIRED_SUBJECTS'
    )
  
    if (!curriculumId || !levelId || !code || !name) {
      redirect(
        `/admin/academic/${curriculumId}?error=Invalid%20level%20data`
      )
    }
  
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      redirect(
        `/admin/academic/${curriculumId}/levels/${levelId}/edit?error=Invalid%20sequence`
      )
    }
  
    if (
      levelNumber !== null &&
      (!Number.isInteger(levelNumber) || levelNumber < 0)
    ) {
      redirect(
        `/admin/academic/${curriculumId}/levels/${levelId}/edit?error=Invalid%20grade%20number`
      )
    }
  
    if (
      !['FOUNDATION', 'GRADE', 'DIPLOMA', 'OTHER'].includes(
        levelType
      )
    ) {
      redirect(
        `/admin/academic/${curriculumId}/levels/${levelId}/edit?error=Invalid%20level%20type`
      )
    }
  
    if (
      !['ALL_REQUIRED_SUBJECTS', 'MANUAL'].includes(
        completionRule
      )
    ) {
      redirect(
        `/admin/academic/${curriculumId}/levels/${levelId}/edit?error=Invalid%20completion%20rule`
      )
    }
  
    const { error } = await supabase
      .from('curriculum_levels')
      .update({
        code,
        name,
        sequence_no: sequenceNo,
        level_number: levelNumber,
        level_type: levelType,
        completion_rule: completionRule,
        updated_at: new Date().toISOString(),
      })
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
  
    if (error) {
      redirect(
        `/admin/academic/${curriculumId}/levels/${levelId}/edit?error=Could%20not%20update%20level`
      )
    }
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(
      `/admin/academic/${curriculumId}/levels/${levelId}`
    )
  
    redirect(
      `/admin/academic/${curriculumId}?success=${encodeURIComponent('Đã cập nhật cấp độ')}`
    )
  }
  export async function updateCurriculumSubject(formData: FormData) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const subjectId = String(
      formData.get('subject_id') ?? ''
    ).trim()
  
    const familyCode = String(
      formData.get('family_code') ?? ''
    )
      .trim()
      .toUpperCase()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const subjectLevelValue = String(
      formData.get('subject_level') ?? ''
    ).trim()
  
    const subjectLevel =
      subjectLevelValue === ''
        ? null
        : Number(subjectLevelValue)
  
    const sortOrder = Number(
      formData.get('sort_order') ?? 0
    )
  
    const completionRule = String(
      formData.get('completion_rule') ?? ''
    )
  
    const isRequired =
      formData.get('is_required') === 'true'
  
    const editPath =
      `/admin/academic/${curriculumId}` +
      `/levels/${levelId}` +
      `/subjects/${subjectId}/edit`
  
    if (
      !curriculumId ||
      !levelId ||
      !subjectId ||
      !familyCode ||
      !code ||
      !name
    ) {
      redirect(`${editPath}?error=Invalid%20subject%20data`)
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(familyCode)) {
      redirect(`${editPath}?error=Invalid%20family%20code`)
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
      redirect(`${editPath}?error=Invalid%20subject%20code`)
    }
  
    if (
      subjectLevel !== null &&
      (!Number.isInteger(subjectLevel) || subjectLevel < 0)
    ) {
      redirect(`${editPath}?error=Invalid%20subject%20level`)
    }
  
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      redirect(`${editPath}?error=Invalid%20sort%20order`)
    }
  
    if (
      ![
        'ALL_REQUIRED_COMPONENTS',
        'DIRECT_ASSESSMENT',
      ].includes(completionRule)
    ) {
      redirect(`${editPath}?error=Invalid%20completion%20rule`)
    }
  
    const { data: level } = await supabase
      .from('curriculum_levels')
      .select('id')
      .eq('id', levelId)
      .eq('curriculum_id', curriculumId)
      .maybeSingle()
  
    if (!level) {
      redirect(`${editPath}?error=Invalid%20academic%20structure`)
    }
  
    const { error } = await supabase
      .from('curriculum_subjects')
      .update({
        family_code: familyCode,
        code,
        name,
        subject_level: subjectLevel,
        is_required: isRequired,
        completion_rule: completionRule,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subjectId)
      .eq('level_id', levelId)
  
    if (error) {
      if (error.code === '23505') {
        redirect(
          `${editPath}?error=This%20subject%20already%20exists`
        )
      }
  
      redirect(`${editPath}?error=Could%20not%20update%20subject`)
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}/levels/${levelId}`
  
    revalidatePath('/admin/academic')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(returnPath)
    revalidatePath(
      `${returnPath}/subjects/${subjectId}`
    )
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã cập nhật môn học')}`
    )
  }
  export async function updateCurriculumSubjectComponent(
    formData: FormData
  ) {
    const supabase = await requireSuperAdmin()
  
    const curriculumId = String(
      formData.get('curriculum_id') ?? ''
    ).trim()
  
    const levelId = String(
      formData.get('level_id') ?? ''
    ).trim()
  
    const subjectId = String(
      formData.get('subject_id') ?? ''
    ).trim()
  
    const componentId = String(
      formData.get('component_id') ?? ''
    ).trim()
  
    const code = String(formData.get('code') ?? '')
      .trim()
      .toUpperCase()
  
    const name = String(formData.get('name') ?? '').trim()
  
    const sortOrder = Number(
      formData.get('sort_order') ?? 0
    )
  
    const isRequired =
      formData.get('is_required') === 'true'

    const completionRule = String(formData.get('completion_rule') ?? '')
  
    const editPath =
      `/admin/academic/${curriculumId}` +
      `/levels/${levelId}` +
      `/subjects/${subjectId}/components/${componentId}/edit`
  
    if (
      !curriculumId ||
      !levelId ||
      !subjectId ||
      !componentId ||
      !code ||
      !name
    ) {
      redirect(`${editPath}?error=Invalid%20component%20data`)
    }
  
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
      redirect(`${editPath}?error=Invalid%20component%20code`)
    }
  
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      redirect(`${editPath}?error=Invalid%20sort%20order`)
    }

    if (!['DIRECT_ASSESSMENT', 'ALL_REQUIRED_ITEMS'].includes(completionRule)) {
      redirect(`${editPath}?error=Choose%20how%20the%20assessment%20group%20is%20completed`)
    }
  
    const { data: subject } = await supabase
      .from('curriculum_subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('level_id', levelId)
      .maybeSingle()
  
    if (!subject) {
      redirect(`${editPath}?error=Invalid%20academic%20structure`)
    }
  
    const { error } = await supabase
      .from('curriculum_subject_components')
      .update({
        code,
        name,
        is_required: isRequired,
        sort_order: sortOrder,
        completion_rule: completionRule,
        updated_at: new Date().toISOString(),
      })
      .eq('id', componentId)
      .eq('subject_id', subjectId)
  
    if (error) {
      if (error.code === '23505') {
        redirect(
          `${editPath}?error=This%20component%20already%20exists`
        )
      }

      if (error.message.includes('requires at least one required active item')) {
        redirect(
          `${editPath}?error=A%20lesson-completed%20group%20needs%20one%20required%20active%20lesson`
        )
      }
  
      redirect(
        `${editPath}?error=Could%20not%20update%20component`
      )
    }
  
    const returnPath =
      `/admin/academic/${curriculumId}` +
      `/levels/${levelId}` +
      `/subjects/${subjectId}`
  
    revalidatePath('/admin/academic')
    revalidatePath('/admin/programs')
    revalidatePath(`/admin/academic/${curriculumId}`)
    revalidatePath(
      `/admin/academic/${curriculumId}/levels/${levelId}`
    )
    revalidatePath(returnPath)
  
    redirect(
      `${returnPath}?success=${encodeURIComponent('Đã cập nhật nhóm đánh giá')}`
    )
  }

function lessonSubjectPath(curriculumId: string, levelId: string, subjectId: string) {
  return `/admin/academic/${curriculumId}/levels/${levelId}/subjects/${subjectId}`
}

function lessonDetailPath(curriculumId: string, levelId: string, subjectId: string, lessonId: string) {
  return `${lessonSubjectPath(curriculumId, levelId, subjectId)}/lessons/${lessonId}`
}

function lessonContext(formData: FormData) {
  return {
    curriculumId: String(formData.get('curriculum_id') ?? '').trim(),
    levelId: String(formData.get('level_id') ?? '').trim(),
    subjectId: String(formData.get('subject_id') ?? '').trim(),
    componentId: String(formData.get('component_id') ?? '').trim(),
    lessonId: String(formData.get('lesson_id') ?? '').trim(),
  }
}

function refreshLessonPaths(curriculumId: string, levelId: string, subjectId: string, lessonId?: string) {
  const subjectPath = lessonSubjectPath(curriculumId, levelId, subjectId)
  revalidatePath('/admin/programs')
  revalidatePath('/admin/academic')
  revalidatePath(`/admin/academic/${curriculumId}`)
  revalidatePath(`/admin/academic/${curriculumId}/levels/${levelId}`)
  revalidatePath(subjectPath)
  if (lessonId) revalidatePath(lessonDetailPath(curriculumId, levelId, subjectId, lessonId))
  return subjectPath
}

export async function createCurriculumLesson(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const { curriculumId, levelId, subjectId, componentId } = lessonContext(formData)
  const subjectPath = lessonSubjectPath(curriculumId, levelId, subjectId)
  const code = normalizeLessonCode(String(formData.get('code') ?? ''))
  const name = String(formData.get('name') ?? '').trim()
  const sortOrder = Number(formData.get('sort_order') ?? 0)
  const isRequired = formData.get('is_required') === 'true'
  const status = String(formData.get('status') ?? 'ACTIVE')

  if (!curriculumId || !levelId || !subjectId) {
    redirect('/admin/academic?error=Không%20thể%20lưu%20Lesson.')
  }
  if (!componentId) {
    const { data: subject } = await supabase
      .from('curriculum_subjects')
      .select('completion_rule')
      .eq('id', subjectId)
      .eq('level_id', levelId)
      .maybeSingle()
    redirect(`${subjectPath}?error=${encodeURIComponent(missingLessonParentMessage(subject?.completion_rule ?? ''))}`)
  }
  if (!lessonCodeValid(code)) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid lesson code' }))}`)
  }
  if (!name || name.length > 200) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Lesson name is required' }))}`)
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid sort order' }))}`)
  }
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid lesson status' }))}`)
  }

  const { error } = await supabase.rpc('create_curriculum_lesson', {
    p_curriculum_id: curriculumId,
    p_level_id: levelId,
    p_subject_id: subjectId,
    p_component_id: componentId,
    p_code: code,
    p_name: name,
    p_is_required: isRequired,
    p_sort_order: sortOrder,
    p_status: status,
  })
  if (error) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError(error))}`)
  }
  refreshLessonPaths(curriculumId, levelId, subjectId)
  redirect(`${subjectPath}?success=${encodeURIComponent('Đã tạo Lesson')}`)
}

export async function updateCurriculumLesson(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const { curriculumId, levelId, subjectId, lessonId } = lessonContext(formData)
  const detailPath = lessonId
    ? lessonDetailPath(curriculumId, levelId, subjectId, lessonId)
    : lessonSubjectPath(curriculumId, levelId, subjectId)
  const code = normalizeLessonCode(String(formData.get('code') ?? ''))
  const name = String(formData.get('name') ?? '').trim()
  const sortOrder = Number(formData.get('sort_order') ?? 0)
  const isRequired = formData.get('is_required') === 'true'
  const status = String(formData.get('status') ?? '')

  if (!curriculumId || !levelId || !subjectId || !lessonId) {
    redirect(`${detailPath}?error=${encodeURIComponent('Không thể lưu Lesson.')}`)
  }
  if (!lessonCodeValid(code)) {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid lesson code' }))}`)
  }
  if (!name || name.length > 200) {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Lesson name is required' }))}`)
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid sort order' }))}`)
  }
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid lesson status' }))}`)
  }

  const { error } = await supabase.rpc('update_curriculum_lesson', {
    p_curriculum_id: curriculumId,
    p_level_id: levelId,
    p_subject_id: subjectId,
    p_lesson_id: lessonId,
    p_code: code,
    p_name: name,
    p_is_required: isRequired,
    p_sort_order: sortOrder,
    p_status: status,
  })
  if (error) {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError(error))}`)
  }
  refreshLessonPaths(curriculumId, levelId, subjectId, lessonId)
  redirect(`${detailPath}?success=${encodeURIComponent('Đã cập nhật Lesson')}`)
}

export async function reorderCurriculumLesson(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const { curriculumId, levelId, subjectId, lessonId } = lessonContext(formData)
  const subjectPath = lessonSubjectPath(curriculumId, levelId, subjectId)
  const direction = String(formData.get('direction') ?? '')
  const scope = String(formData.get('scope') ?? 'active')
  if (!curriculumId || !levelId || !subjectId || !lessonId || (direction !== 'up' && direction !== 'down') || (scope !== 'active' && scope !== 'all')) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError({ message: 'Invalid lesson order' }))}`)
  }
  const { error } = await supabase.rpc('reorder_curriculum_lesson', {
    p_curriculum_id: curriculumId,
    p_level_id: levelId,
    p_subject_id: subjectId,
    p_lesson_id: lessonId,
    p_direction: direction,
    p_scope: scope,
  })
  if (error) {
    redirect(`${subjectPath}?error=${encodeURIComponent(lessonWriteError(error))}`)
  }
  refreshLessonPaths(curriculumId, levelId, subjectId, lessonId)
  redirect(`${subjectPath}?success=${encodeURIComponent('Đã đổi thứ tự Lesson')}`)
}

export async function retireCurriculumLesson(formData: FormData) {
  const supabase = await requireSuperAdmin()
  const { curriculumId, levelId, subjectId, lessonId } = lessonContext(formData)
  const detailPath = lessonId
    ? lessonDetailPath(curriculumId, levelId, subjectId, lessonId)
    : lessonSubjectPath(curriculumId, levelId, subjectId)
  if (!curriculumId || !levelId || !subjectId || !lessonId) {
    redirect(`${detailPath}?error=${encodeURIComponent('Không thể lưu Lesson.')}`)
  }
  const { error } = await supabase.rpc('retire_curriculum_lesson', {
    p_curriculum_id: curriculumId,
    p_level_id: levelId,
    p_subject_id: subjectId,
    p_lesson_id: lessonId,
  })
  if (error) {
    redirect(`${detailPath}?error=${encodeURIComponent(lessonWriteError(error))}`)
  }
  refreshLessonPaths(curriculumId, levelId, subjectId, lessonId)
  redirect(`${lessonSubjectPath(curriculumId, levelId, subjectId)}?success=${encodeURIComponent('Đã ngừng sử dụng Lesson')}`)
}