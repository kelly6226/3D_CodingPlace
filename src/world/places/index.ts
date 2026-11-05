// 장소 목록. 새 장소를 추가하려면 여기와 config.ts의 PLACES, supabase/schema.sql의 rooms_place_check에 같이 넣어요.
import type { PlaceId } from '../../config';
import { CANVAS_TEXT } from '../textures';
import { cafe } from './cafe';
import { hackathon } from './hackathon';
import { serverroom } from './serverroom';
import { studio } from './studio';
import { TEX2_TEXT } from './tex2';
import type { PlaceDef } from './types';

const DEFS: Record<PlaceId, PlaceDef> = { cafe, serverroom, studio, hackathon };

export const placeDef = (id: PlaceId | string | null | undefined): PlaceDef => DEFS[id as PlaceId] ?? cafe;

/** 캔버스에 그리는 글자 전부 (웹폰트 미리 받기용) */
export const ALL_CANVAS_TEXT = {
  hand: CANVAS_TEXT.hand + ' ' + TEX2_TEXT,
  mono: CANVAS_TEXT.mono,
  ui: [CANVAS_TEXT.ui, TEX2_TEXT, ...Object.values(DEFS).map((d) => d.canvasText)].join(' '),
};

export type { PlaceDef };
