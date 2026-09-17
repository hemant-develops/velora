import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateId } from '../utils/format';
import { Brand, CatalogModel } from '../types';

// PHASE A -- CATALOG FOUNDATION
//
// Replaces the old fully-static src/data/brands.ts + src/data/carModels.ts
// as the app's RUNTIME source for brands/models: both tables now live in
// Supabase (public.brands, public.car_models -- see
// supabase/migrations/0001_catalog_foundation.sql), admin-manageable, so a
// brand/model an admin adds later shows up here on next load with no app
// update. The static files are NOT deleted -- brands.ts's ids are exactly
// what seeded public.brands.id (see the migration's comment on why), and
// this context falls back to them if the network fetch fails, so a car
// already listed under a known brand id still shows a real name instead of
// a blank/broken picker while offline.
//
// This mirrors CarsContext's own fetch/realtime/RLS-driven pattern
// deliberately, rather than inventing a different one.

interface BrandRow {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  display_order: number;
  is_custom: boolean;
}

interface CarModelRow {
  id: string;
  brand_id: string;
  name: string;
  display_name: string | null;
  body_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  seats: number | null;
  is_ev: boolean;
  is_hybrid: boolean;
  is_active: boolean;
  is_custom: boolean;
  display_order: number;
}

const rowToBrand = (row: BrandRow): Brand => ({
  id: row.id,
  name: row.name,
  // Falls back to a neutral placeholder rather than an empty/broken <Image>
  // -- a brand added by an admin without a logo yet should still render.
  logo: row.logo_url || 'https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1200&auto=format&fit=crop',
  isCustom: row.is_custom,
});

const rowToModel = (row: CarModelRow): CatalogModel => ({
  id: row.id,
  brandId: row.brand_id,
  name: row.name,
  displayName: row.display_name ?? undefined,
  bodyType: (row.body_type as CatalogModel['bodyType']) ?? undefined,
  fuelType: (row.fuel_type as CatalogModel['fuelType']) ?? undefined,
  transmission: (row.transmission as CatalogModel['transmission']) ?? undefined,
  seats: row.seats ?? undefined,
  isEv: row.is_ev,
  isHybrid: row.is_hybrid,
  isActive: row.is_active,
  isCustom: row.is_custom,
});

export interface ManualModelInput {
  brandId: string;
  name: string;
  year: number;
  fuelType: CatalogModel['fuelType'];
  transmission: CatalogModel['transmission'];
  seats: number;
}

export type AddManualModelResult = { ok: true; modelId: string } | { ok: false; error: string };
export type AddManualBrandResult = { ok: true; brandId: string } | { ok: false; error: string };

interface CatalogContextValue {
  brands: Brand[];
  isLoaded: boolean;
  getModelsForBrand: (brandId: string) => CatalogModel[];
  getModelById: (modelId: string) => CatalogModel | undefined;
  // Backs OwnerAddCarScreen's "Can't find your model? Add manually" —
  // inserts ONE new car_models row scoped to the signed-in owner
  // (is_custom: true, is_active: false, created_by: auth.uid()), which is
  // the entire client-writable surface car_models RLS allows (see the
  // migration) — this can never create or edit a canonical/active entry.
  addManualModel: (input: ManualModelInput) => Promise<AddManualModelResult>;
  // Same "Add manually" escape hatch, one level up -- for when the car's
  // actual BRAND isn't in the curated catalog at all (see
  // supabase/migrations/0024_manual_brand_entry.sql). Same pending/
  // owner-scoped shape as addManualModel above.
  addManualBrand: (name: string) => Promise<AddManualBrandResult>;
  refreshCatalog: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const fetchTokenRef = useRef(0);

  const fetchCatalog = async () => {
    const token = ++fetchTokenRef.current;
    try {
      const [brandsResult, modelsResult] = await Promise.all([
        // RLS returns every active brand PLUS this signed-in owner's own
        // pending custom submissions -- see brands_select_authenticated in
        // 0024_manual_brand_entry.sql. No client-side is_active filter here
        // for the same reason car_models below doesn't have one: filtering
        // it here would hide an owner's own pending custom brand from their
        // own listing wizard.
        supabase.from('brands').select('*').order('display_order', { ascending: true }),
        // RLS returns every active model PLUS this signed-in owner's own
        // pending custom submissions -- see car_models_select in the
        // migration. No client-side filtering needed on top of that.
        supabase.from('car_models').select('*').order('display_order', { ascending: true }),
      ]);
      if (fetchTokenRef.current !== token) return;

      if (brandsResult.error) {
        console.log(`VELORA_CATALOG_BRANDS_FETCH_ERROR: ${brandsResult.error.message}`);
      } else {
        setBrands(((brandsResult.data ?? []) as BrandRow[]).map(rowToBrand));
      }

      if (modelsResult.error) {
        console.log(`VELORA_CATALOG_MODELS_FETCH_ERROR: ${modelsResult.error.message}`);
      } else {
        setModels(((modelsResult.data ?? []) as CarModelRow[]).map(rowToModel));
      }
    } catch (error) {
      if (fetchTokenRef.current !== token) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_CATALOG_FETCH_FAILED: ${message}`);
    } finally {
      if (fetchTokenRef.current === token) setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchCatalog();
    // Same triggers CarsContext already uses for its own table: auth
    // changes (a different signed-in owner legitimately sees a different
    // set of pending custom models) and realtime changes (an admin
    // approving/adding a brand or model shows up without a restart).
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchCatalog();
    });
    const channel = supabase
      .channel('catalog_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => fetchCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'car_models' }, () => fetchCatalog())
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const getModelsForBrand = (brandId: string): CatalogModel[] => models.filter((m) => m.brandId === brandId);
  const getModelById = (modelId: string): CatalogModel | undefined => models.find((m) => m.id === modelId);

  const addManualModel = async (input: ManualModelInput): Promise<AddManualModelResult> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in to add a model.' };

    const { data, error } = await supabase
      .from('car_models')
      .insert({
        brand_id: input.brandId,
        name: input.name.trim(),
        fuel_type: input.fuelType ?? null,
        transmission: input.transmission ?? null,
        seats: input.seats,
        is_custom: true,
        is_active: false,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`VELORA_CATALOG_ADD_MANUAL_MODEL_ERROR: ${error.message}`);
      return { ok: false, error: "Couldn't add this model right now. Please try again." };
    }

    const newModel: CatalogModel = {
      id: (data as { id: string }).id,
      brandId: input.brandId,
      name: input.name.trim(),
      fuelType: input.fuelType,
      transmission: input.transmission,
      seats: input.seats,
      isEv: input.fuelType === 'Electric',
      isHybrid: input.fuelType === 'Hybrid',
      isActive: false,
      isCustom: true,
    };
    setModels((prev) => [...prev, newModel]);

    return { ok: true, modelId: newModel.id };
  };

  const addManualBrand = async (name: string): Promise<AddManualBrandResult> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in to add a brand.' };

    const trimmedName = name.trim();
    // brands.id is a plain text primary key (not a generated uuid -- see
    // 0001_catalog_foundation.sql), unlike car_models, so a fresh, unique id
    // has to be generated client-side rather than left to the database.
    const { data, error } = await supabase
      .from('brands')
      .insert({
        id: generateId('brand'),
        name: trimmedName,
        is_custom: true,
        is_active: false,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`VELORA_CATALOG_ADD_MANUAL_BRAND_ERROR: ${error.message}`);
      return { ok: false, error: "Couldn't add this brand right now. Please try again." };
    }

    const newBrand: Brand = {
      id: (data as { id: string }).id,
      name: trimmedName,
      logo: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1200&auto=format&fit=crop',
      isCustom: true,
    };
    setBrands((prev) => [...prev, newBrand]);

    return { ok: true, brandId: newBrand.id };
  };

  const value = useMemo<CatalogContextValue>(
    () => ({ brands, isLoaded, getModelsForBrand, getModelById, addManualModel, addManualBrand, refreshCatalog: fetchCatalog }),
    [brands, models, isLoaded],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = (): CatalogContextValue => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within a CatalogProvider');
  return ctx;
};
