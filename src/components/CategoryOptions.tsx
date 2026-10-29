import { BOOKKEEPING_CATEGORIES, CATEGORIES, INCOME_CATEGORIES } from '../lib/categories';

export function CategoryOptions({ filterMode = false }: {
  filterMode?: boolean;
}) {
  if (filterMode)
    return <>
      <option className="category-option-expense" value="group:expense">Expenses</option>
      {CATEGORIES.filter((category) => category !== 'Income').map((category) => <option className="category-option-expense" key={category} value={category}>{'　' + category}</option>)}
      <option className="category-option-income" value="group:income">Income</option>
      {INCOME_CATEGORIES.map((category) => <option className="category-option-income" key={'Income:' + category} value={'Income:' + category}>{'　' + category}</option>)}
      <option className="category-option-bookkeeping" value="group:bookkeeping">Bookkeeping</option>
      {BOOKKEEPING_CATEGORIES.map((category) => <option className="category-option-bookkeeping" key={category} value={category}>{'　' + category}</option>)}
      <option className="category-option-uncategorized">Uncategorized</option>
    </>;
  return <>
    <optgroup label="Expenses" className="category-group-expense">
      {CATEGORIES.filter((category) => category !== 'Income')
        .map((category) => <option className="category-option-expense" key={category}>{category}</option>)}
    </optgroup>
    <optgroup label="Income" className="category-group-income">
      {INCOME_CATEGORIES.map((category) => <option className="category-option-income" key={category} value={'Income:' + category}>{category}</option>)}
    </optgroup>
    <optgroup label="Bookkeeping" className="category-group-bookkeeping">
      {BOOKKEEPING_CATEGORIES.map((category) => <option className="category-option-bookkeeping" key={category}>{category}</option>)}<option className="category-option-uncategorized">Uncategorized</option>
    </optgroup>
  </>;
}
