export type UnitDefinition = {
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
};

export type UnitOption = {
  unit: string;
  ratio: number;
};

export function getUnitOptions(definition: UnitDefinition): UnitOption[] {
  const options: UnitOption[] = [{ unit: definition.baseUnit, ratio: 1 }];
  if (definition.packUnit && definition.packSize && definition.packSize > 0) {
    options.push({ unit: definition.packUnit, ratio: definition.packSize });
  }
  return options;
}

export function toBaseQuantity(
  quantity: number,
  unit: string,
  definition: UnitDefinition
) {
  if (unit === definition.baseUnit) {
    return quantity;
  }
  if (definition.packUnit && unit === definition.packUnit) {
    return quantity * (definition.packSize ?? 1);
  }
  return quantity;
}

export function toDisplayQuantity(
  baseQuantity: number,
  unit: string,
  definition: UnitDefinition
) {
  if (unit === definition.baseUnit) {
    return baseQuantity;
  }
  if (definition.packUnit && unit === definition.packUnit) {
    return definition.packSize ? baseQuantity / definition.packSize : baseQuantity;
  }
  return baseQuantity;
}
