# Instrument customer preflight V1

Read from `supabase/migrations/20260916223000_serialized_instruments.sql` before the care tables were added.

## Sale authority

`instrument_events.movement_id` is the primary key and references `inventory_movements.id`. A sale is `kind = 'SALE'`. That row already stores `unit_id`, `branch_id`, `sale_price`, `currency`, `warranty_until`, `reason`, `created_by`, and `created_at`.

Serial is `instrument_units.serial`, unique per catalogue item. Brand and model are `instrument_catalogue`. Acquisition cost and asking price are `instrument_commercial_details`. Those commercial rows are not the sale price.

`move_instrument` is the writer. Sale, unit, and cost rows reject update and delete. Select policies on the instrument tables allow `SUPER_ADMIN` only.

Invoices do not carry instrument lines. `invoice_items.item_type` remains tuition.

## Buyer

No buyer column exists on the sale. A buyer does not need an application login, and buying an instrument must not create a student.

## Decision used by Sprint 6

`instrument_sale_customer_links.sale_event_id` references the sale movement and is unique. The link may store an existing `student_id`, an existing `parent_id`, and a contact name and phone. It does not copy serial, sale price, sale date, or `warranty_until`.

Warranty cases and after-sales follow-ups reference the same sale id. The care list is a security-definer function so a branch permission can see the sale fields it needs without a new select policy on cost or serial tables, and without returning `acquisition_cost`.
