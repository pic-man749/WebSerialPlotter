import { AxisId } from '../types/index.js';

/**
 * データ一覧テーブル
 * 受信データのキー名・グラフ描画色・最新値・軸割り当てを表示する
 */
export class DataTable {
  private container: HTMLElement;
  private tbody!: HTMLTableSectionElement;

  /** 行ごとのDOM参照（キー → 行要素群） */
  private rows: Map<string, DataTableRow> = new Map();

  /** 軸変更時のコールバック */
  onAxisChange: ((key: string, axis: AxisId) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.buildDOM();
  }

  /**
   * 新しいキーの行を追加する
   */
  addKey(key: string, color: string): void {
    if (this.rows.has(key)) return;

    const tr = document.createElement('tr');

    // 色カラム
    const tdColor = document.createElement('td');
    const indicator = document.createElement('span');
    indicator.className = 'color-indicator';
    indicator.style.backgroundColor = color;
    tdColor.appendChild(indicator);

    // キー名カラム
    const tdKey = document.createElement('td');
    tdKey.textContent = key;

    // 最新値カラム
    const tdValue = document.createElement('td');
    tdValue.className = 'data-table__value';
    tdValue.textContent = '-';

    // 軸選択カラム
    const tdAxis = document.createElement('td');
    const axisSelect = document.createElement('select');
    axisSelect.className = 'select';
    axisSelect.innerHTML = `
      <option value="y1" selected>Y1 (左)</option>
      <option value="y2">Y2 (右)</option>
    `;
    axisSelect.addEventListener('change', () => {
      this.onAxisChange?.(key, axisSelect.value as AxisId);
    });
    tdAxis.appendChild(axisSelect);

    tr.appendChild(tdColor);
    tr.appendChild(tdKey);
    tr.appendChild(tdValue);
    tr.appendChild(tdAxis);

    this.tbody.appendChild(tr);

    this.rows.set(key, {
      tr,
      valueCell: tdValue,
      axisSelect,
      indicator,
    });
  }

  /**
   * 最新値を更新する（textContent差分更新）
   */
  updateValues(values: Map<string, number>): void {
    for (const [key, value] of values) {
      const row = this.rows.get(key);
      if (!row) continue;

      const text = String(value);
      // 差分比較で変更がある場合のみDOM更新
      if (row.valueCell.textContent !== text) {
        row.valueCell.textContent = text;
      }
    }
  }

  /**
   * 指定キーの色を更新する
   */
  updateColor(key: string, color: string): void {
    const row = this.rows.get(key);
    if (row) {
      row.indicator.style.backgroundColor = color;
    }
  }

  /**
   * DOM構造を構築する
   */
  private buildDOM(): void {
    this.container.innerHTML = `
      <h2 class="panel__title">データ一覧</h2>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 40px;">色</th>
            <th>キー名</th>
            <th>最新値</th>
            <th style="width: 100px;">軸</th>
          </tr>
        </thead>
        <tbody id="data-table-body"></tbody>
      </table>
    `;

    this.tbody = this.container.querySelector('#data-table-body') as HTMLTableSectionElement;
  }
}

/** テーブル行のDOM参照 */
interface DataTableRow {
  tr: HTMLTableRowElement;
  valueCell: HTMLTableCellElement;
  axisSelect: HTMLSelectElement;
  indicator: HTMLSpanElement;
}
