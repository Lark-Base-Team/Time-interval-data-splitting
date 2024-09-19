import { bitable, UIBuilder, FieldType } from "@lark-base-open/js-sdk";
import { UseTranslationResponse } from 'react-i18next';

export default async function(uiBuilder: UIBuilder, { t }: UseTranslationResponse<'translation', undefined>) {
  uiBuilder.form((form) => ({
    formItems: [
      form.tableSelect('table', { label: '选择数据表' }),
      form.fieldSelect('startField', { label: '开始时间字段', sourceTable: 'table', multiple: false, filter: ({ name, type }) => type === FieldType.DateTime }),
      form.fieldSelect('endField', { label: '结束时间字段', sourceTable: 'table', multiple: false, filter: ({ name, type }) => type === FieldType.DateTime }),
      form.select('splitType', { label: '拆分类型', options: [{ label: '跨年', value: '跨年' }, { label: '跨月', value: '跨月' }], defaultValue: '跨年' }),
      form.fieldSelect('sharingField', { label: '比例分成字段(多选)', sourceTable: 'table', multiple: true, filter: ({ name, type }) => type === FieldType.Number || type === FieldType.Currency, placeholder: "允许数字/货币进行拆分" }),
      form.radio(
        'keepField',
        {
          label: '是否保留源记录',
          options: ['是', '否'],
          defaultValue: '是',
        }
      ),
    ],
    buttons: ['确定'],
  }), async ({ values }: { values: any }) => {
    const { table, startField, endField, sharingField, keepField, splitType } = values;
    const tableData = await bitable.base.getTableById(table.id as string);

    const startFieldId = startField.id;
    const endFieldId = endField.id;

    let recordList:string[] = []
    let hasMorePage = false
    let nextPageToken: number | undefined = undefined
    do {
      const { hasMore, pageToken, records } = await table.getRecordsByPage({
          pageToken: nextPageToken,
          pageSize: 200
      })
      nextPageToken = pageToken
      hasMorePage = hasMore
      recordList = recordList.concat(records)
  } while (hasMorePage)
    

    const result:any = [];

    for (const record of recordList) {
       console.log(result)

      const splitFunction = splitType === '跨年' ? 'getFullYear' : 'getMonth';
      let endValue:any  = record.fields[endFieldId];
      let startValue:any  = record.fields[startFieldId];


      if (new Date(endValue)[splitFunction]() !== new Date(startValue)[splitFunction]()) {
        let currentTask = { ...record.fields };

        let taskEndValue:any  = currentTask[endFieldId];
        let taskStartValue:any  = currentTask[startFieldId];

        while (new Date(taskEndValue)[splitFunction]() !== new Date(taskStartValue)[splitFunction]()) {
          const startValue:any = new Date(taskStartValue);
          const endValue:any = new Date(taskEndValue);
          const endOfUnit = splitType === '跨年' ? new Date(`12/31/${startValue.getFullYear()} 23:59:59`).getTime() : new Date(startValue.getFullYear(), startValue.getMonth() + 1, 0, 23, 59, 59).getTime();
          const startOfNextUnit = splitType === '跨年' ? new Date(`01/01/${startValue.getFullYear() + 1} 00:00:00`).getTime() : new Date(startValue.getFullYear(), startValue.getMonth() + 1, 1, 0, 0, 0).getTime();

          const ratio = (endOfUnit - startValue) / (endValue - startValue);

          const firstRecord:any = { ...currentTask, [endFieldId]: endOfUnit };
          const secondRecord:any = { ...currentTask, [startFieldId]: startOfNextUnit };

          if (sharingField) {
            sharingField.forEach((field:any) => {
              let sharingValue:any = currentTask[field.id];
              firstRecord[field.id] = Math.round(parseInt(sharingValue) * ratio);
              secondRecord[field.id] = Math.round(parseInt(sharingValue) * (1 - ratio));
            });
          }

          result.push({ fields: firstRecord });
          currentTask = secondRecord;
          taskStartValue = currentTask[startFieldId];
        }

        if (new Date(taskEndValue)[splitFunction]() === new Date(taskStartValue)[splitFunction]()) {
          result.push({ fields: currentTask });
        }


        if (result.length === 1 && new Date(result[0].fields[endFieldId])[splitFunction]() === new Date(result[0].fields[startFieldId])[splitFunction]()) {
          result.length = 0;
        }
      }
      
      if(keepField == "否"){
        await tableData.deleteRecord(record.recordId)
      }
    }

     console.log(result)
    

    if (result.length >= 1) {
      await tableData.addRecords(result);
    }

    uiBuilder.message.success('运行成功！');
    
  });
}
